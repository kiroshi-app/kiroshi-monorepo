Unicode true
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define NAME "Kiroshi Rune Preview"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.kiroshi.rune-preview"

Name "${NAME}"
OutFile "${INSTALLER}"
InstallDir "$LOCALAPPDATA\Programs\${NAME}"
Icon "${STAGED}\icon.ico"
UninstallIcon "${STAGED}\icon.ico"

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section
	SetOutPath "$INSTDIR"
	File /r "${STAGED}\*"
	WriteUninstaller "$INSTDIR\uninstall.exe"
	CreateShortCut "$SMPROGRAMS\${NAME}.lnk" "$INSTDIR\kiroshi-rune-preview.exe" "" "$INSTDIR\icon.ico"
	WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${NAME}"
	WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
	WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\icon.ico"
	WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Kiroshi"
	WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
	WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
	WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
	Delete "$SMPROGRAMS\${NAME}.lnk"
	RMDir /r "$INSTDIR"
	DeleteRegKey HKCU "${UNINSTALL_KEY}"
SectionEnd
