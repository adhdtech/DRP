using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace ADHDTech.DRP
{
    public class DRP_WebsocketConn : WebSocketSharp.WebSocket
    {
        public Dictionary<string, TaskCompletionSource<object>> ReplyHandlerQueue;
        public int TokenNum;
        public DRP_WebsocketConn(string url, params string[] protocols) : base(url, protocols)
        {
            ReplyHandlerQueue = new Dictionary<string, TaskCompletionSource<object>>();
            TokenNum = 1;
        }
    }
    public class DRP_Endpoint
    {
        public Dictionary<string, Func<Dictionary<string, object>, DRP_WebsocketConn, string, object>> EndpointCmds;
        public DRP_Endpoint()
        {
        }

        public string GetToken(DRP_WebsocketConn wsConn)
        {
            // Generate token
            //string token = Guid.NewGuid().ToString();
            int token = wsConn.TokenNum;
            wsConn.TokenNum++;
            return token.ToString();
        }

        public string AddReplyHandler(DRP_WebsocketConn wsConn, TaskCompletionSource<object> callback)
        {
            string token = GetToken(wsConn);
            wsConn.ReplyHandlerQueue[token] = callback;
            return token;
        }

        public void DeleteReplyHandler(DRP_WebsocketConn wsConn, string token)
        {
            wsConn.ReplyHandlerQueue.Remove(token);
        }

        public void RegisterMethod(string methodName, Func<Dictionary<string, object>, DRP_WebsocketConn, string, object> method)
        {
            EndpointCmds[methodName] = method;
        }

        // Send DRP Cmd
        public void SendCmd(DRP_WebsocketConn wsConn, string serviceName, string cmd, Dictionary<string, object> @params, TaskCompletionSource<object> callback)
        {
            // Get token
            string token = AddReplyHandler(wsConn, callback);

            // Send command
            DRP_Cmd sendCmd = new DRP_Cmd(cmd, serviceName, token, @params);
            wsConn.Send(Newtonsoft.Json.JsonConvert.SerializeObject(sendCmd));
        }

        // Send DRP Cmd and wait for results
        public JObject SendCmd(DRP_WebsocketConn wsConn, string serviceName, string cmd, object @params, int timeout)
        {
            // Define return object
            JObject returnObject = null;

            // Define task dummy task to await return
            Task<object> ReturnDataTask = new Task<object>(() =>
            {
                return null;
            });

            // Define action to execute task
            /*
            void returnAction()
            {
                ReturnDataTask.Start();
            }
            */

            Console.WriteLine("Sending cmd");

            // Send command, wait up to 30 seconds for return
            /*
            SendCmd(wsConn, serviceName, cmd, @params, data =>
            {
                Console.WriteLine("Starting callback passed to SendCmd...");
                try
                {
                    if (data.GetType() == typeof(JObject))
                    {
                        JObject returnData = (JObject)data;
                        returnObject = returnData;
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("Error converting message to JObject: " + ex.Message + "\r\n<<<" + data + ">>>");
                }
                ReturnDataTask.Start();
            });
            */

            Console.WriteLine("Starting wait");

            // Wait for task to complete
            ReturnDataTask.Wait(timeout);

            Console.WriteLine("Received response");

            // Return Data
            return returnObject;
        }

        public void ProcessCmd(DRP_WebsocketConn wsConn, DRP_MsgIn message)
        {
            if (message.token != null && message.token.Length > 0)
            {
                //thisEndpoint.SendReply(wsConn, message.token, cmdResults.status, cmdResults.output);
            }
        }
        public void ProcessReply(DRP_WebsocketConn wsConn, DRP_MsgIn message)
        {
            if (wsConn.ReplyHandlerQueue.ContainsKey(message.token))
            {
                // Execute callback
                //Console.WriteLine("Executing callback for token -> [{0}]", message.token);
                TaskCompletionSource<object> thisTcs = wsConn.ReplyHandlerQueue[message.token];
                // Check for error
                if (message.err != null)
                {
                    // An error was set, throw an error
                    // TO DO - add proper exception handling instead of just throwing back the error
                    thisTcs.SetResult(message.err);
                }
                else {
                    thisTcs.SetResult(message.payload);
                }
                wsConn.ReplyHandlerQueue.Remove(message.token);
            }
            else
            {
                // Bad token
                Console.WriteLine("Received command token with no pending callback -> [{0}]", message.token);
            }
        }
        public void ProcessStream(DRP_WebsocketConn wsConn, DRP_MsgIn message) { }

        public void ReceiveMessage(DRP_WebsocketConn wsConn, EventArgs e)
        {

            var thisEndpoint = this;
            // We received data
            WebSocketSharp.MessageEventArgs messageArgs = (WebSocketSharp.MessageEventArgs)e;

            Console.WriteLine("> " + messageArgs.Data);
            //throw new InvalidOperationException("Cannot ReceiveMessage");

            // See what we received
            DRP_MsgIn message = Newtonsoft.Json.JsonConvert.DeserializeObject<DRP_MsgIn>(messageArgs.Data);
            //Console.WriteLine(messageArgs.Data);

            switch (message.type)
            {
                case "cmd":
                    thisEndpoint.ProcessCmd(wsConn, message);
                    break;
                case "reply":
                    thisEndpoint.ProcessReply(wsConn, message);
                    break;
                case "stream":
                    thisEndpoint.ProcessStream(wsConn, message);
                    break;
                default:
                    Console.WriteLine("Invalid message.type; here's the JSON data..." + messageArgs.Data);
                    break;
            }

        }
    }

    public class DRP_Client : DRP_Endpoint
    {
        public DRP_WebsocketConn wsConn;
        public bool clientConnected = false;
        public bool clientDied = false;
        public BrokerProfile brokerProfile = null;
        public TaskCompletionSource<bool> clientReady = new TaskCompletionSource<bool>();
        public TaskCompletionSource<bool> clientClosed = new TaskCompletionSource<bool>();

        public DRP_Client(BrokerProfile argBrokerProfile)
        {
            brokerProfile = argBrokerProfile;

            // Connect to WS
            wsConn = new DRP_WebsocketConn(brokerProfile.URL, new string[] { "drp" });
            wsConn.SslConfiguration.EnabledSslProtocols = System.Security.Authentication.SslProtocols.Tls12;
            if (brokerProfile.ProxyAddress != "")
            {
                wsConn.SetProxy(brokerProfile.ProxyAddress, brokerProfile.ProxyUser, brokerProfile.ProxyPass);
            }

            wsConn.OnOpen += (sender, e) =>
                StartClientSession(wsConn, e);

            wsConn.OnMessage += (sender, e) =>
                ReceiveMessage(wsConn, e);

            wsConn.OnError += (sender, e) =>
                Console.WriteLine("Error: " + e.Message);

            wsConn.OnClose += EndClientSession;
            wsConn.OnClose += (sender, e) =>
            {
                if (!clientReady.Task.IsCompleted)
                {
                    clientReady.SetResult(false);
                }
            };


        }

        public async Task<bool> Open()
        {
            wsConn.Connect();
            if (await Task.WhenAny(clientReady.Task, Task.Delay(5000)) == clientReady.Task)
            {
                // task completed within timeout
                clientConnected = clientReady.Task.Result;
            }
            else
            {
                // timeout logic
                clientReady.SetResult(false);
            }
            return clientConnected;
        }

        public void CloseSession()
        {
            // Close websocket
            if (wsConn.ReadyState != WebSocketSharp.WebSocketState.Closing && wsConn.ReadyState != WebSocketSharp.WebSocketState.Closed)
                wsConn.Close();
        }

        public async void StartClientSession(DRP_WebsocketConn wsConn, EventArgs e)
        {
            // We have a connection
            //Console.WriteLine("Session open!");

            // If we have credentials, authenticate
            object returnedData = await SendCmd_Async("DRP", "hello", new Dictionary<string, object>() {
                    { "userAgent", "dotnet" },
                    { "user", brokerProfile.User },
                    { "pass", brokerProfile.Pass }
                });
            if (! clientReady.Task.IsCompleted)
            {
                if (returnedData is null) {
                    clientReady.SetResult(false);
                } else {
                    clientReady.SetResult(true);
                }
            }
        }

        public void EndClientSession(object sender, EventArgs e)
        {
            // The session has ended
            WebSocketSharp.CloseEventArgs closeArgs = (WebSocketSharp.CloseEventArgs)e;
            if (!clientConnected)
            {
                clientDied = true;
            }
            clientClosed.SetResult(true);
            //Console.WriteLine("Close code: '" + closeArgs.Code + "'");
        }

        public async Task<object> SendCmd_Async(string serviceName, string cmd, Dictionary<string, object> @params)
        {
            TaskCompletionSource<object> thisTcs = new TaskCompletionSource<object>();

            // Get token
            string token = AddReplyHandler(wsConn, thisTcs);

            // Send command
            DRP_Cmd sendCmd = new DRP_Cmd(serviceName, cmd, token, @params);
            string sendCmdString = null;
            try
            {
                sendCmdString = Newtonsoft.Json.JsonConvert.SerializeObject(sendCmd);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Error serializing DRP_Cmd to string: " + ex.Message);
                return null;
            }
            wsConn.Send(sendCmdString);
            //Console.WriteLine("< " + sendCmdString);
            object data = null;
            if (await Task.WhenAny(thisTcs.Task, Task.Delay(brokerProfile.Timeout), clientClosed.Task) == thisTcs.Task)
            {
                // task completed within timeout
                data = await thisTcs.Task;
            }
            else
            {
                // timeout logic
                return null;
            }

            return data;
        }

        // Shortcut to execute SendCmd
        public JObject SendCmd(string cmd, object @params)
        {
            return SendCmd(wsConn, null, cmd, @params, this.brokerProfile.Timeout);
        }
    }

    public class DRP_Cmd
    {
        public string type;
        public string serviceName;
        public string method;
        public Dictionary<string, object> @params;
        public string token;

        public DRP_Cmd(string serviceName, string method, string cmdToken, Dictionary<string, object> sendData)
        {
            this.type = "cmd";
            this.method = method;
            this.@params = sendData;
            this.serviceName = serviceName;
            this.token = cmdToken;
        }
    }

    public class DRP_CmdError
    {
        public string name;
        public ushort code;
        public string message;
        public string source;
        public string stack;
    }

    public class DRP_Reply
    {
        public string token;
        public string status;
        public DRP_CmdError err;
        public object payload;

        public DRP_Reply(string inToken, string inStatus, DRP_CmdError inErr, object inPayload)
        {
            token = inToken;
            status = inStatus;
            err = inErr;
            payload = inPayload;
        }
    }

    public class DRP_MsgIn
    {
        public string type;
        public string method;
        public string serviceName;
        public object @params;
        public object payload;
        public string status;
        public DRP_CmdError err;
        public string token;
    }

    public class Playbook
    {
        public List<Action<Action>> RunSteps = new List<Action<Action>>();
        public Playbook()
        {
        }
        public void AddStep(Action<Action> callback)
        {
            RunSteps.Add(nextAction => callback(nextAction));
        }
        public void Run()
        {
            RunNextStep();
        }
        public void RunNextStep()
        {
            Action<Action> thisStep = RunSteps[0];
            RunSteps.RemoveAt(0);
            if (RunSteps.Count > 0)
            {
                thisStep(() => RunNextStep());
            }
            else
            {
                thisStep(null);
            }
        }
    }
}
