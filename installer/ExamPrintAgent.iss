; Build with Inno Setup (ISCC.exe) to produce ExamPrintAgentSetup.exe.
; The bundle is staged by build.ps1 and contains the Electron dashboard and Node agent.

#define AppName "Exam Print Agent"
#define AppVersion "1.9.1"

[Setup]
AppId={{B1F6F01E-4B11-4E9D-A2F9-1234567890AB}}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\Exam Print Agent
DefaultGroupName={#AppName}
PrivilegesRequired=admin
OutputDir=output
OutputBaseFilename=ExamPrintAgentSetup
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#AppName}

[Files]
Source: "bundle\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\HPO Print Agent"; Filename: "{app}\HPO Print Agent.exe"; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"
Name: "{group}\HPO Print Agent"; Filename: "{app}\HPO Print Agent.exe"; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\setup.ps1"" -InstallDirectory ""{app}"""; Description: "Ghép nối và cài Print Agent"; Flags: waituntilterminated

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\uninstall-agent.ps1"" -RemoveFiles:$false -NonInteractive"; RunOnceId: "RemoveExamPrintAgent"; Flags: runhidden waituntilterminated
