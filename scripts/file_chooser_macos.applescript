on run argv
  if (count of argv) is 0 then error "missing POSIX file path"
  set targetPath to item 1 of argv
  set the clipboard to targetPath
  tell application "System Events"
    keystroke "g" using {command down, shift down}
    delay 0.2
    keystroke "v" using {command down}
    delay 0.2
    key code 36
    delay 0.2
    key code 36
  end tell
end run
