using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Win32.SafeHandles;

// Trusted read-only broker helper. No shell, provider, HTTP, or generated-code execution.
public sealed class ASILockedTree : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct FileInfo {
        public uint Attributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInfo info);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder path, uint size, uint flags);
    readonly List<SafeFileHandle> handles = new List<SafeFileHandle>();
    readonly List<SafeFileHandle> files = new List<SafeFileHandle>();
    readonly List<string> names = new List<string>();
    readonly List<long> sizes = new List<long>();
    readonly List<string> missing = new List<string>();
    public string[] MissingPaths { get { return missing.ToArray(); } }
    readonly HashSet<string> directories = new HashSet<string>(StringComparer.Ordinal);
    readonly string root;
    public sealed class Entry {
        public string Path { get; set; }
        public string Content { get; set; }
        public string Digest { get; set; }
        public string GitSha1 { get; set; }
        public string GitSha256 { get; set; }
    }
    static string FinalPath(SafeFileHandle handle) {
        var text = new StringBuilder(32768);
        uint length = GetFinalPathNameByHandleW(handle, text, (uint)text.Capacity, 0);
        if (length == 0 || length >= text.Capacity) throw new IOException("ROOT_NOT_AUTHORIZED");
        string path = text.ToString();
        if (path.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) throw new IOException("ROOT_NOT_AUTHORIZED");
        if (path.StartsWith(@"\\?\", StringComparison.Ordinal)) path = path.Substring(4);
        return path.TrimEnd('\\');
    }
    SafeFileHandle Open(string path, bool directory, bool allowMissing = false) {
        // Open the reparse point itself, inspect the actual handle, and never follow a link for content.
        var handle = CreateFileW(path, 0x80000000, 1, IntPtr.Zero, 3, 0x00200000 | (directory ? 0x02000000u : 0u), IntPtr.Zero);
        if (handle.IsInvalid) {
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            if (allowMissing && (error == 2 || error == 3)) return null;
            throw new IOException("REPOSITORY_CHANGED");
        }
        try {
            FileInfo info;
            if (!GetFileInformationByHandle(handle, out info) || (info.Attributes & 0x400) != 0 ||
                (((info.Attributes & 0x10) != 0) != directory) || (!directory && info.Links != 1)) {
                throw new IOException("ROOT_NOT_AUTHORIZED");
            }
            string final = FinalPath(handle);
            if (!final.Equals(root, StringComparison.OrdinalIgnoreCase) && !final.StartsWith(root + "\\", StringComparison.OrdinalIgnoreCase)) throw new IOException("ROOT_NOT_AUTHORIZED");
            handles.Add(handle);
            return handle;
        } catch { handle.Dispose(); throw; }
    }
    public ASILockedTree(string source, string[] paths, bool allowMissing) {
        root = System.IO.Path.GetFullPath(source).TrimEnd('\\');
        if (root.StartsWith(@"\\") || root.Length <= 3 || paths.Length > 1000) throw new IOException("ROOT_NOT_AUTHORIZED");
        long total = 0;
        try {
            Open(root, true);
            directories.Add(root);
            var unique = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string name in paths) {
                if (String.IsNullOrEmpty(name) || System.IO.Path.IsPathRooted(name) || name.IndexOf('\\') >= 0 || name.IndexOf(':') >= 0 || !unique.Add(name)) throw new IOException("ROOT_NOT_AUTHORIZED");
                string[] components = name.Split('/');
                foreach (string part in components) {
                    if (part == ".." || part == "." || part.Length == 0 || part.EndsWith(".") || part.EndsWith(" ")) throw new IOException("ROOT_NOT_AUTHORIZED");
                    if (System.Text.RegularExpressions.Regex.IsMatch(part, @"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) throw new IOException("ROOT_NOT_AUTHORIZED");
                    foreach (char c in part) if (c < 32) throw new IOException("ROOT_NOT_AUTHORIZED");
                }
                string current = root;
                bool absent = false;
                for (int i = 0; i < components.Length - 1; i++) {
                    current = System.IO.Path.Combine(current, components[i]);
                    if (directories.Add(current) && Open(current, true, allowMissing) == null) { absent = true; break; }
                }
                if (absent) { missing.Add(name); continue; }
                string file = System.IO.Path.Combine(current, components[components.Length - 1]);
                var handle = Open(file, false, allowMissing);
                if (handle == null) { missing.Add(name); continue; }
                FileInfo info;
                if (!GetFileInformationByHandle(handle, out info)) throw new IOException("REPOSITORY_CHANGED");
                long size = ((long)info.SizeHigh << 32) | info.SizeLow;
                total += size;
                if (size > 8 * 1024 * 1024 || total > 64 * 1024 * 1024) throw new IOException("QUOTA_EXCEEDED");
                files.Add(handle); names.Add(name); sizes.Add(size);
            }
        } catch { Dispose(); throw; }
    }
    static string Hex(byte[] bytes) { return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant(); }
    public static Entry[] ReadCommitted(string source, string[] paths, string[] hashes) {
        if (paths.Length != hashes.Length || paths.Length > 1000 || source.IndexOf('"') >= 0) throw new IOException("ROOT_NOT_AUTHORIZED");
        var result = new List<Entry>();
        var process = new System.Diagnostics.Process();
        process.StartInfo = new System.Diagnostics.ProcessStartInfo("git.exe",
            "--no-lazy-fetch --no-optional-locks --no-replace-objects -c core.fsmonitor=false -c core.hooksPath=NUL -c core.excludesFile=NUL -C \"" + source.TrimEnd('\\') + "\" cat-file --batch");
        process.StartInfo.UseShellExecute = false;
        process.StartInfo.CreateNoWindow = true;
        process.StartInfo.RedirectStandardInput = true;
        process.StartInfo.RedirectStandardOutput = true;
        process.StartInfo.RedirectStandardError = true;
        process.ErrorDataReceived += delegate(object sender, System.Diagnostics.DataReceivedEventArgs args) { };
        process.Start();
        process.BeginErrorReadLine();
        using (var deadline = new System.Threading.Timer(delegate(object ignored) { try { if (!process.HasExited) process.Kill(); } catch { } }, null, 20000, System.Threading.Timeout.Infinite)) {
            try {
                long total = 0;
                for (int index=0; index<paths.Length; index++) {
                    if (!System.Text.RegularExpressions.Regex.IsMatch(hashes[index], @"^([a-f0-9]{40}|[a-f0-9]{64})$")) throw new IOException("ROOT_NOT_AUTHORIZED");
                    process.StandardInput.Write(hashes[index] + "\n");
                    process.StandardInput.Flush();
                    var header = new StringBuilder();
                    int item;
                    while ((item = process.StandardOutput.BaseStream.ReadByte()) != 10) {
                        if (item < 0 || header.Length > 200) throw new IOException("REPOSITORY_CHANGED");
                        header.Append((char)item);
                    }
                    string[] fields = header.ToString().TrimEnd('\r').Split(' ');
                    long length;
                    if (fields.Length != 3 || fields[0] != hashes[index] || fields[1] != "blob" || !long.TryParse(fields[2], out length)) throw new IOException("REPOSITORY_CHANGED");
                    total += length;
                    if (length < 0 || length > 8*1024*1024 || total > 64*1024*1024) throw new IOException("QUOTA_EXCEEDED");
                    byte[] bytes = new byte[(int)length];
                    int read = 0;
                    while (read < bytes.Length) {
                        int count = process.StandardOutput.BaseStream.Read(bytes,read,bytes.Length-read);
                        if (count <= 0) throw new IOException("REPOSITORY_CHANGED");
                        read += count;
                    }
                    if (process.StandardOutput.BaseStream.ReadByte() != 10) throw new IOException("REPOSITORY_CHANGED");
                    byte[] prefix = Encoding.ASCII.GetBytes("blob " + bytes.Length + "\0");
                    byte[] gitObject = new byte[prefix.Length + bytes.Length];
                    Buffer.BlockCopy(prefix,0,gitObject,0,prefix.Length);
                    Buffer.BlockCopy(bytes,0,gitObject,prefix.Length,bytes.Length);
                    using (var sha=SHA256.Create()) using (var sha1=SHA1.Create()) {
                        string gitHash = hashes[index].Length == 40 ? Hex(sha1.ComputeHash(gitObject)) : Hex(sha.ComputeHash(gitObject));
                        if (gitHash != hashes[index]) throw new IOException("REPOSITORY_CHANGED");
                        result.Add(new Entry { Path=paths[index], Content=Convert.ToBase64String(bytes), Digest=Hex(sha.ComputeHash(bytes)) });
                    }
                }
                process.StandardInput.Close();
                if (!process.WaitForExit(5000) || process.ExitCode != 0) throw new IOException("REPOSITORY_CHANGED");
            } finally {
                if (!process.HasExited) { try { process.Kill(); process.WaitForExit(); } catch { } }
                process.Dispose();
            }
        }
        return result.ToArray();
    }
    public Entry[] ReadAll() {
        var result = new List<Entry>();
        for (int index = 0; index < files.Count; index++) {
            byte[] bytes = new byte[(int)sizes[index]];
            using (var stream = new FileStream(files[index], FileAccess.Read, 65536, false)) {
                int read = 0;
                while (read < bytes.Length) {
                    int count = stream.Read(bytes, read, bytes.Length - read);
                    if (count == 0) throw new IOException("REPOSITORY_CHANGED");
                    read += count;
                }
                if (stream.ReadByte() != -1) throw new IOException("REPOSITORY_CHANGED");
            }
            byte[] header = Encoding.ASCII.GetBytes("blob " + bytes.Length + "\0");
            byte[] gitObject = new byte[header.Length + bytes.Length];
            Buffer.BlockCopy(header, 0, gitObject, 0, header.Length);
            Buffer.BlockCopy(bytes, 0, gitObject, header.Length, bytes.Length);
            using (var sha = SHA256.Create()) using (var sha1 = SHA1.Create()) {
                result.Add(new Entry { Path=names[index], Content=Convert.ToBase64String(bytes), Digest=Hex(sha.ComputeHash(bytes)),
                    GitSha1=Hex(sha1.ComputeHash(gitObject)), GitSha256=Hex(sha.ComputeHash(gitObject)) });
            }
        }
        return result.ToArray();
    }
    public void Dispose() { foreach (var handle in handles) handle.Dispose(); handles.Clear(); }
}

// Kernel change notifications avoid relying on asynchronous FileSystemWatcher callback timing.
public sealed class ASIChangeMonitor : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct Overlapped { public IntPtr Internal, InternalHigh; public uint Offset, OffsetHigh; public IntPtr Event; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool ReadDirectoryChangesW(SafeFileHandle directory, IntPtr buffer, uint size, bool subtree, uint filter, IntPtr bytes, IntPtr overlapped, IntPtr callback);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetOverlappedResult(SafeFileHandle handle, IntPtr overlapped, out uint bytes, bool wait);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool CancelIoEx(SafeFileHandle handle, IntPtr overlapped);
    SafeFileHandle directory;
    readonly System.Threading.EventWaitHandle changed = new System.Threading.EventWaitHandle(false, System.Threading.EventResetMode.ManualReset);
    IntPtr buffer, operation;
    bool pending;
    public ASIChangeMonitor(string root) {
        try {
            directory = CreateFileW(root, 1, 7, IntPtr.Zero, 3, 0x02000000 | 0x40000000, IntPtr.Zero);
            if (directory.IsInvalid) throw new IOException("ROOT_NOT_AUTHORIZED");
            buffer = Marshal.AllocHGlobal(65536);
            operation = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Overlapped)));
            var state = new Overlapped { Event = changed.SafeWaitHandle.DangerousGetHandle() };
            Marshal.StructureToPtr(state, operation, false);
            bool accepted = ReadDirectoryChangesW(directory, buffer, 65536, true, 1 | 2 | 8 | 16 | 64, IntPtr.Zero, operation, IntPtr.Zero);
            if (!accepted && Marshal.GetLastWin32Error() != 997) throw new IOException("ROOT_NOT_AUTHORIZED");
            pending = true;
        } catch { Dispose(); throw; }
    }
    public void AssertUnchanged() {
        uint bytes;
        bool completed = GetOverlappedResult(directory, operation, out bytes, false);
        if (completed || Marshal.GetLastWin32Error() != 996) throw new IOException("REPOSITORY_CHANGED");
    }
    public void Dispose() {
        if (directory != null && !directory.IsInvalid && pending) {
            CancelIoEx(directory, operation);
            uint bytes; GetOverlappedResult(directory, operation, out bytes, true);
            pending = false;
        }
        if (directory != null) directory.Dispose();
        if (operation != IntPtr.Zero) { Marshal.FreeHGlobal(operation); operation = IntPtr.Zero; }
        if (buffer != IntPtr.Zero) { Marshal.FreeHGlobal(buffer); buffer = IntPtr.Zero; }
        changed.Dispose();
    }
}
