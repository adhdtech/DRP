set DOMAINNAME=mydomain.xyz
set MESHKEY=supersecretkey
set DEBUG=true
set TESTMODE=true
set USESWAGGER=true
set AUTHENTICATORSERVICE=
set STARTPARAMS=--trace-warnings

REM Start nodes for Bangor
set PORT=8082
set ZONENAME=Bangor
start "Registry-Bangor" node %STARTPARAMS% drpRegistry.js
timeout /T 1
set PORT=8080
set VDMTITLE=Bangor
start "Broker-Bangor" node %STARTPARAMS% drpBroker.js
set PORT=
start "Authenticator-Bangor" node %STARTPARAMS% drpProvider-Test-Authenticator.js
set SCOPE=zone
start "Municipality-Bangor" node %STARTPARAMS% drpProvider-Municipality.js

REM Start nodes for Portland
set PORT=8083
set ZONENAME=Portland
start "Registry-Portland" node %STARTPARAMS% drpRegistry.js
timeout /T 1
set PORT=8081
set VDMTITLE=Portland
start "Broker-Portland" node %STARTPARAMS% drpBroker.js
set PORT=
start "Authenticator-Portland" node %STARTPARAMS% drpProvider-Test-Authenticator.js
set SCOPE=zone
start "Municipality-Portland" node %STARTPARAMS% drpProvider-Municipality.js

REM Start nodes for Augusta
set PORT=8084
set ZONENAME=Augusta
start "Registry-Augusta" node %STARTPARAMS% drpRegistry.js
timeout /T 1
set SCOPE=zone
start "Municipality-Augusta" node %STARTPARAMS% drpProvider-Municipality.js

REM Start nodes for StateOfMaine
set PORT=8085
set ZONENAME=StateOfMaine
start "Registry-StateOfMaine" node %STARTPARAMS% drpRegistry.js
timeout /T 1
set PORT=
set SCOPE=global
start "State-Maine" node %STARTPARAMS% drpProvider-State.js

