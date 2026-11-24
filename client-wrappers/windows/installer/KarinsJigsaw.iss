; The installer of Karins jigsaw for Windows (Inno Setup 6, https://jrsoftware.org/isinfo.php).
; Made by: npm run windows:release (builds client-wrappers/windows/publish, runs this script, copies the result to the website installs folder)  ->  client-wrappers/windows/installer/output/KarinsJigsawSetup.exe
; It installs for the current person only (no administrator needed), with a Start menu entry and an optional desktop icon.
[Setup]
AppId={{F4009D68-76DB-440A-BE6C-91348F40130F}
AppName=Karins jigsaw
AppVersion=1.0.0
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

[Files]
Source: "..\publish\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Karins jigsaw"; Filename: "{app}\KarinsJigsaw.exe"
Name: "{autodesktop}\Karins jigsaw"; Filename: "{app}\KarinsJigsaw.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\KarinsJigsaw.exe"; Description: "Open Karins jigsaw"; Flags: nowait postinstall skipifsilent
