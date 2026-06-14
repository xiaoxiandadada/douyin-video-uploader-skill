on run argv
  if (count of argv) < 1 then error "missing POSIX file path"
  set targetPath to item 1 of argv

  set viewportWidth to 1280
  set viewportHeight to 900
  set uploadX to 1118
  set uploadY to 360
  if (count of argv) >= 3 then
    set uploadX to (item 2 of argv) as number
    set uploadY to (item 3 of argv) as number
  end if
  if (count of argv) >= 5 then
    set viewportWidth to (item 4 of argv) as number
    set viewportHeight to (item 5 of argv) as number
  end if

  set the clipboard to targetPath

  tell application "System Events"
    set candidateNames to {"Codex", "ChatGPT", "Microsoft Edge", "Google Chrome"}
    set targetProcess to missing value
    repeat with processName in candidateNames
      if exists process (processName as text) then
        tell process (processName as text)
          if (count of windows) > 0 then
            set targetProcess to processName as text
            exit repeat
          end if
        end tell
      end if
    end repeat
    if targetProcess is missing value then error "no browser host process window found"

    tell process targetProcess
      set frontmost to true
      delay 0.4
      set bestWindow to missing value
      set bestArea to 0
      repeat with w in windows
        try
          set s to size of w
          set area to (item 1 of s) * (item 2 of s)
          if area > bestArea then
            set bestWindow to w
            set bestArea to area
          end if
        end try
      end repeat
      if bestWindow is missing value then error "no usable host window found"
      set p to position of bestWindow
      set s to size of bestWindow
      set clickX to (item 1 of p) + ((item 1 of s) * uploadX / viewportWidth)
      set clickY to (item 2 of p) + ((item 2 of s) * uploadY / viewportHeight)
      click at {clickX, clickY}
    end tell

    delay 1.0
    keystroke "g" using {command down, shift down}
    delay 0.2
    keystroke "v" using {command down}
    delay 0.2
    key code 36
    delay 0.5
    key code 36
  end tell
end run
