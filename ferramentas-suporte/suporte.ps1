param([ValidateSet('atualizar','restaurar','recuperar')][string]$Modo='atualizar')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$OutputEncoding=[Console]::OutputEncoding
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$taskTitle='Suporte da barbearia'
$taskBase=Split-Path -Parent $PSScriptRoot
$script:taskHelper=Join-Path $PSScriptRoot 'suporte.cjs'
function Show-Info([string]$message){[System.Windows.Forms.MessageBox]::Show($message,$taskTitle,'OK','Information') | Out-Null}
function Confirm-Action([string]$message){return [System.Windows.Forms.MessageBox]::Show($message,$taskTitle,'YesNo','Warning','Button2') -eq 'Yes'}
function Run-Support([string[]]$arguments){
  $ErrorActionPreference='Continue'
  $taskResponse=& $script:taskNode $script:taskHelper @arguments 2>&1
  $taskCode=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  $taskText=($taskResponse | ForEach-Object {"$_"}) -join "`n"
  try{$taskResult=$taskText | ConvertFrom-Json}catch{throw "Não foi possível concluir. Envie esta mensagem ao suporte: $taskText"}
  if($taskCode -ne 0){throw $taskResult.erro}
  return $taskResult
}
try {
  if($Modo -ne 'atualizar' -and (Test-Path -LiteralPath (Join-Path $taskBase 'iniciar_sistema.bat'))){$taskRoot=$taskBase}
  else {
    Show-Info "Primeiro, encerre o sistema pressionando ENTER na janela do iniciador.`n`nNa próxima janela, escolha a pasta do sistema que o cliente já usa: a pasta onde fica iniciar_sistema.bat."
    $taskPicker=New-Object System.Windows.Forms.FolderBrowserDialog
    $taskPicker.Description='Escolha a pasta do sistema, onde fica iniciar_sistema.bat'
    $taskPicker.ShowNewFolderButton=$false
    try {if($taskPicker.ShowDialog() -ne 'OK'){exit 0};$taskRoot=$taskPicker.SelectedPath}finally{$taskPicker.Dispose()}
  }
  if(!(Test-Path -LiteralPath (Join-Path $taskRoot 'iniciar_sistema.bat'))){throw 'Esta não é a pasta do sistema. Selecione a pasta onde fica iniciar_sistema.bat.'}
  $script:taskNode=Join-Path $taskRoot 'bin\node.exe'
  if(!(Test-Path -LiteralPath $script:taskNode)){
    $taskCommand=Get-Command node.exe -ErrorAction SilentlyContinue
    if(!$taskCommand){throw 'O Node.js não foi encontrado. Entre em contato com o suporte.'}
    $script:taskNode=$taskCommand.Source
  }
  switch($Modo){
    'atualizar' {
      $taskPackage=Join-Path $taskBase 'pacote'
      if(!(Test-Path -LiteralPath (Join-Path $taskPackage 'manifesto.json'))){throw 'Extraia o ZIP inteiro antes de abrir ATUALIZAR_SISTEMA.bat.'}
      if(!(Confirm-Action "Atualizar o sistema nesta pasta?`n`n$taskRoot`n`nOs dados e a senha serão mantidos. A versão anterior será guardada automaticamente. Mantenha o sistema fechado até terminar.")){exit 0}
      $taskResult=Run-Support @('atualizar',$taskRoot,$taskPackage)
    }
    'restaurar' {
      $taskFile=New-Object System.Windows.Forms.OpenFileDialog
      $taskFile.Title='Escolha a cópia de segurança que deseja restaurar'
      $taskFile.Filter='Banco da barbearia (*.db)|*.db'
      $taskLocalBackups=Join-Path $taskRoot 'backend\backups'
      if(Test-Path -LiteralPath $taskLocalBackups){$taskFile.InitialDirectory=$taskLocalBackups}
      try {if($taskFile.ShowDialog() -ne 'OK'){exit 0};$taskSelected=$taskFile.FileName}finally{$taskFile.Dispose()}
      $taskCheck=Run-Support @('inspecionar',$taskRoot,$taskSelected)
      $taskMessage="Restaurar esta cópia?`n`nArquivo: $taskSelected`nDono: $($taskCheck.dono)`nAtendimentos: $($taskCheck.atendimentos)`nÚltimo atendimento (UTC): $($taskCheck.ultimo_atendimento)`n`nOs registros e a senha voltarão ao estado dessa cópia. Registros feitos depois dela não estarão no banco restaurado. O banco atual será guardado antes da troca.`n`nConfirme que a cópia pertence a esta barbearia e mantenha o sistema fechado."
      if(!(Confirm-Action $taskMessage)){exit 0}
      $taskResult=Run-Support @('restaurar',$taskRoot,$taskSelected,$taskCheck.sha256)
    }
    'recuperar' {
      if(!(Confirm-Action "Recuperar uma manutenção que foi interrompida nesta pasta?`n`n$taskRoot`n`nMantenha o sistema fechado. Os arquivos anteriores à manutenção serão recuperados. Use esta opção somente quando a atualização ou restauração não terminou.")){exit 0}
      $taskResult=Run-Support @('recuperar',$taskRoot)
    }
  }
  $taskMessage=$taskResult.mensagem
  if($taskResult.copia_anterior){$taskMessage+="`n`nCópia anterior guardada em:`n$($taskResult.copia_anterior)"}
  Show-Info $taskMessage
}catch{
  [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,$taskTitle,'OK','Error') | Out-Null
  exit 1
}
