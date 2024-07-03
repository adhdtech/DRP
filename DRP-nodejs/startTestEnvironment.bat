set DOMAINNAME=mydomain.xyz
set MESHKEY=supersecretkey
set PORT=8082
set ZONENAME=zone1
set DEBUG=true
set TESTMODE=true
set USESWAGGER=true
set AUTHENTICATORSERVICE=
set REGISTRYURL=
set REJECTUNREACHABLE=
set STARTPARAMS=--trace-warnings
start "Registry1" node %STARTPARAMS% drpRegistry.js
timeout /T 1
set PORT=8083
start "Registry2" node %STARTPARAMS% drpRegistry.js
timeout /T 1
set PORT=8084
set ZONENAME=zone2
start "Registry3" node %STARTPARAMS% drpRegistry.js
timeout /T 1
set PORT=8085
start "Registry4" node %STARTPARAMS% drpRegistry.js
timeout /T 1
set PORT=
set ZONENAME=zone1
start "Authenticator" node %STARTPARAMS% drpProvider-Test-Authenticator.js
timeout /T 1
set PORT=8080
start "Broker1" node %STARTPARAMS% drpBroker.js
timeout /T 1
set PORT=8081
set ZONENAME=zone2
start "Broker2" node %STARTPARAMS% drpBroker.js
timeout /T 1
set PORT=
set SCOPE=zone
set ZONENAME=zone1
start "TestService1-zone1" node %STARTPARAMS% drpProvider-Test-NoListener.js
timeout /T 1
start "TestService2-zone1" node %STARTPARAMS% drpProvider-Test-NoListener.js
timeout /T 1
set ZONENAME=zone2
start "TestService1-zone2" node %STARTPARAMS% drpProvider-Test-NoListener.js
timeout /T 1
start "TestService2-zone2" node %STARTPARAMS% drpProvider-Test-NoListener.js
timeout /T 1
set PORT=
set SCOPE=global
set ZONENAME=zone1
start "TestService-Hive" node %STARTPARAMS% drpProvider-Hive.js
start "TestService-DocMgr" node %STARTPARAMS% drpProvider-DocMgr.js