; The installer of Karins jigsaw for Windows (Inno Setup 6, https://jrsoftware.org/isinfo.php).
; Made by: npm run windows:release (builds client-wrappers/windows/publish, runs this script, copies the result to the website downloads)  ->  client-wrappers/windows/installer/output/KarinsJigsawSetup.exe
; It installs for the current person only (no administrator needed), with a Start menu entry and an optional desktop icon.
[Setup]
AppId={{6F2C8E3A-4B7D-4E59-9A1C-5D3E7B9F0A12}
AppName=Karins jigsaw
AppVersion=1.1.0
AppPublisher=Blueboot R&D AS
AppPublisherURL=https://karins-jigsaw.web.app
DefaultDirName={autopf}\Karins jigsaw
DefaultGroupName=Karins jigsaw
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=yes
OutputDir=output
OutputBaseFilename=KarinsJigsawSetup
SetupIconFile=..\app.ico
UninstallDisplayIcon={app}\KarinsJigsaw.exe
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "Put an icon on the desktop"; GroupDescription: "Icons:"
Name: "startup"; Description: "Start Karins jigsaw when I sign in to Windows (hidden, next to the clock), so new messages arrive as notifications"; GroupDescription: "Notifications:"

[Files]
Source: "..\publish\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Karins jigsaw"; Filename: "{app}\KarinsJigsaw.exe"
Name: "{autodesktop}\Karins jigsaw"; Filename: "{app}\KarinsJigsaw.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "KarinsJigsaw"; ValueData: """{app}\KarinsJigsaw.exe"" --tray"; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\KarinsJigsaw.exe"; Description: "Open Karins jigsaw"; Flags: nowait postinstall skipifsilent
