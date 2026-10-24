using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using System.Collections.Generic;
public static class ASIExport {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint a,uint s,IntPtr sec,uint c,uint f,IntPtr t);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder b,uint n,uint f);
 public static void Write(string target,byte[] bytes,bool validate) {
  string full=Path.GetFullPath(target); if(full.StartsWith(@"\\") || !full.Equals(target,StringComparison.OrdinalIgnoreCase)) throw new IOException("DESTINATION_NOT_ALLOWED");
  var handles=new List<SafeFileHandle>();
  try {
   string directory=Path.GetDirectoryName(full); string current=Path.GetPathRoot(full);
   foreach(string part in directory.Substring(current.Length).Split('\\')) {
    if(part.Length==0) continue; current=Path.Combine(current,part);
    var h=CreateFileW(current,0x80000000,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero);handles.Add(h);
    if(h.IsInvalid) throw new IOException("DESTINATION_NOT_ALLOWED");
    var b=new StringBuilder(32768);if(GetFinalPathNameByHandleW(h,b,32768,0)==0 || !b.ToString().Substring(4).TrimEnd('\\').Equals(current,StringComparison.OrdinalIgnoreCase)) throw new IOException("DESTINATION_NOT_ALLOWED");
    if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0) throw new IOException("DESTINATION_NOT_ALLOWED");
   }
   if(File.Exists(full)||Directory.Exists(full)) throw new IOException("OVERWRITE_APPROVAL_REQUIRED");
   if(validate)return;
   using(var h=CreateFileW(full,0x40000000,0,IntPtr.Zero,1,0x00200000,IntPtr.Zero)) {
    if(h.IsInvalid) throw new IOException("EXPORT_OUTCOME_UNKNOWN");
    using(var stream=new FileStream(h,FileAccess.Write)){stream.Write(bytes,0,bytes.Length);stream.Flush(true);}
   }
  } finally {for(int i=handles.Count-1;i>=0;i--)handles[i].Dispose();}
 }
}
