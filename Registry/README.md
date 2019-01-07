# DRP
// Send command - no response expected
// Use: broadcasting
<- {cmd: "notify", data: <payload>, token: null}

// Send command (get 1) - await response
// Use: ordered procedure
<- {cmd: "listproviders", data: null, token: 1}
-> {replytoken: 1, data: <payload> }

// Send command (get 1) - specify response handler (but don't wait)
// Use: mass data collection
<- {cmd: "getreport", data: null, token: 1}
-> {replytoken: 1, data: <payload> }

// Send command (get *) - specify response handler (but don't wait)
<- {cmd: "subscribe", data: "someTopic", token: 1, function(message) { doStuff(message) }, function() { cleanUp() } }
-> {replytoken: 1, data: "OKAY" }
(replace wsConn.ReturnCmdQueue[replyToken] with specified handler, {doStuff(message) })
-> {replytoken: 1, data: <payload>, expectmore: 1 }
-> {replytoken: 1, data: <payload>, expectmore: 1 }
-> {replytoken: 1, data: <payload>, expectmore: 1 }
-> {replytoken: 1, data: null     , expectmore: 0 }
(delete wsConn.ReturnCmdQueue[replyToken], execute cleanUp() )