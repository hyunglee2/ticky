; ticky installer hooks (Tauri NSIS)

; uninstalling: stop starting with Windows too (the app adds this value itself)
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ticky"
!macroend
