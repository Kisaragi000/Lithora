; Lithora installer look. Tauri includes this file near the top of its installer script.
; The Windows font and Lithora's colors replace the classic NSIS look.

; Windows' own UI font instead of the old "MS Shell Dlg".
SetFont "Segoe UI" 9

; Show the logo at the right of each page header, like modern Windows setup dialogs.
!define MUI_HEADERIMAGE_RIGHT

; Logo navy for the big titles on the welcome and finish pages.
!define MUI_TEXTCOLOR 083B69
