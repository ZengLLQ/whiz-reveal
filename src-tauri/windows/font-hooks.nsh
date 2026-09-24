; Tauri NSIS hooks for user-supplied Aeonik fonts.
; Per-user only: never write to HKLM, Windows\Fonts, or the system default font.
; The app also embeds these fonts, so rendering does not depend on registration.
!include LogicLib.nsh

!define WHIZ_FONT_KEY "Software\Microsoft\Windows NT\CurrentVersion\Fonts"
!define WHIZ_FONT_OWNER_KEY "Software\com.jaycee.whizreveal\InstalledFonts"
!define WHIZ_FONT_DIR "$LOCALAPPDATA\Microsoft\Windows\Fonts"

!macro WHIZ_INSTALL_FONT WEIGHT
  StrCpy $0 "${WHIZ_FONT_DIR}\WhizReveal-Aeonik-${WEIGHT}.ttf"
  ClearErrors
  ReadRegStr $1 HKCU "${WHIZ_FONT_KEY}" "Aeonik ${WEIGHT} (TrueType)"
  ${IfNot} ${Errors}
    ; A repair can restore a missing file, but only if both ownership records agree.
    ${If} $1 != $0
      Goto whiz_font_done_${WEIGHT}
    ${EndIf}
    ReadRegStr $2 HKCU "${WHIZ_FONT_OWNER_KEY}" "${WEIGHT}"
    ${If} $2 != $0
      Goto whiz_font_done_${WEIGHT}
    ${EndIf}
    IfFileExists "$0" whiz_font_done_${WEIGHT}
  ${EndIf}

  ; Respect fonts installed for all users as well as existing per-user fonts.
  ClearErrors
  ReadRegStr $1 HKLM "${WHIZ_FONT_KEY}" "Aeonik ${WEIGHT} (TrueType)"
  ${IfNot} ${Errors}
    Goto whiz_font_done_${WEIGHT}
  ${EndIf}
  ; Some installers register Regular under the family name alone.
  !if "${WEIGHT}" == "Regular"
    ClearErrors
    ReadRegStr $1 HKCU "${WHIZ_FONT_KEY}" "Aeonik (TrueType)"
    ${IfNot} ${Errors}
      Goto whiz_font_done_${WEIGHT}
    ${EndIf}
    ClearErrors
    ReadRegStr $1 HKLM "${WHIZ_FONT_KEY}" "Aeonik (TrueType)"
    ${IfNot} ${Errors}
      Goto whiz_font_done_${WEIGHT}
    ${EndIf}
  !endif

  ; Do not replace or claim a preexisting file, even at our reserved filename.
  IfFileExists "$0" whiz_font_done_${WEIGHT}
  CreateDirectory "${WHIZ_FONT_DIR}"
  ; FailIfExists also protects a file created after the existence check above.
  System::Call 'kernel32::CopyFileW(w "$INSTDIR\fonts\Aeonik-${WEIGHT}.ttf", w r0, i 1) i.r1'
  ${If} $1 == 0
    DetailPrint "Aeonik ${WEIGHT}: Windows registration skipped; bundled app font remains available."
    Goto whiz_font_done_${WEIGHT}
  ${EndIf}

  ; Record ownership before publishing the registration. Roll back on failure.
  ClearErrors
  WriteRegStr HKCU "${WHIZ_FONT_OWNER_KEY}" "${WEIGHT}" "$0"
  ${If} ${Errors}
    Delete "$0"
    Goto whiz_font_done_${WEIGHT}
  ${EndIf}
  ClearErrors
  WriteRegStr HKCU "${WHIZ_FONT_KEY}" "Aeonik ${WEIGHT} (TrueType)" "$0"
  ${If} ${Errors}
    DeleteRegValue HKCU "${WHIZ_FONT_OWNER_KEY}" "${WEIGHT}"
    Delete "$0"
    Goto whiz_font_done_${WEIGHT}
  ${EndIf}
  System::Call 'gdi32::AddFontResourceExW(w r0, i 0, p 0) i.r1'
  DetailPrint "Aeonik ${WEIGHT}: installed for the current Windows user."
  whiz_font_done_${WEIGHT}:
!macroend

!macro WHIZ_UNINSTALL_FONT WEIGHT
  StrCpy $0 "${WHIZ_FONT_DIR}\WhizReveal-Aeonik-${WEIGHT}.ttf"
  ReadRegStr $1 HKCU "${WHIZ_FONT_OWNER_KEY}" "${WEIGHT}"
  ${If} $1 == $0
    ReadRegStr $2 HKCU "${WHIZ_FONT_KEY}" "Aeonik ${WEIGHT} (TrueType)"
    ${If} $2 == $0
      ; Leave another application's replacement registration untouched.
      System::Call 'gdi32::RemoveFontResourceExW(w r0, i 0, p 0)'
      DeleteRegValue HKCU "${WHIZ_FONT_KEY}" "Aeonik ${WEIGHT} (TrueType)"
      Delete /REBOOTOK "$0"
    ${ElseIf} $2 == ""
      ; The registration was removed separately, but this file is still ours.
      Delete /REBOOTOK "$0"
    ${EndIf}
    DeleteRegValue HKCU "${WHIZ_FONT_OWNER_KEY}" "${WEIGHT}"
  ${EndIf}
!macroend

!macro WHIZ_FONT_CHANGE
  ; WM_FONTCHANGE to HWND_BROADCAST, bounded to avoid hanging on another app.
  System::Call 'user32::SendMessageTimeoutW(p 0xffff, i 0x001d, p 0, p 0, i 2, i 1000, *p .r1)'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Push $0
  Push $1
  Push $2
  !insertmacro WHIZ_INSTALL_FONT "Regular"
  !insertmacro WHIZ_INSTALL_FONT "Medium"
  !insertmacro WHIZ_INSTALL_FONT "Bold"
  !insertmacro WHIZ_FONT_CHANGE
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Tauri calls the old uninstaller during upgrades. Keep font registrations then.
  ${If} $UpdateMode <> 1
    Push $0
    Push $1
    Push $2
    !insertmacro WHIZ_UNINSTALL_FONT "Regular"
    !insertmacro WHIZ_UNINSTALL_FONT "Medium"
    !insertmacro WHIZ_UNINSTALL_FONT "Bold"
    DeleteRegKey /ifempty HKCU "${WHIZ_FONT_OWNER_KEY}"
    DeleteRegKey /ifempty HKCU "Software\com.jaycee.whizreveal"
    !insertmacro WHIZ_FONT_CHANGE
    Pop $2
    Pop $1
    Pop $0
  ${EndIf}
!macroend
