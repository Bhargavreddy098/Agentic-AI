import { clsx, type ClassValue } from "@asi/ui";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}