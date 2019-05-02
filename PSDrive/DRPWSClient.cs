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
        public Dictionary<string, Action<object>> ReplyHandlerQueue;
        public Dictionary<string, Action<object>> StreamHandlerQueue;
        public int TokenNum;
        public DRP_WebsocketConn(string url, params string[] protocols) : base(url, protocols)
        {
            ReplyHandlerQueue = new Dictionary<string, Action<object>>();
            StreamHandlerQueue = new Dictionary<string, Action<object>>();
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
            int replyToken = wsConn.TokenNum;
            wsConn.TokenNum++;
            return replyToken.ToString();
        }

        public string AddReplyHandler(DRP_WebsocketConn wsConn, Action<object> callback)
        {
            string replyToken = GetToken(wsConn);
            wsConn.ReplyHandlerQueue[replyToken] = callback;
            return replyToken;
        }

        public void DeleteReplyHandler(DRP_WebsocketConn wsConn, string token)
        {
            wsConn.ReplyHandlerQueue.Remove(token);
        }

        public string AddStreamHandler(DRP_WebsocketConn wsConn, Action<object> callback)
        {
            string replyToken = GetToken(wsConn);
            wsConn.StreamHandlerQueue[replyToken] = callback;
            return replyToken;
        }

        public void DeleteStreamHandler(DRP_WebsocketConn wsConn, string token)
        {
            wsConn.StreamHandlerQueue.Remove(token);
        }

        public void RegisterCmd(string cmd, Func<Dictionary<string, object>, DRP_WebsocketConn, string, object> method)
        {
            EndpointCmds[cmd] = method;
        }

        // Send DRP Cmd
        public void SendCmd(DRP_WebsocketConn wsConn, string serviceName, string cmd, object @params, Action<object> callback)
        {
            // Get token
            string token = AddReplyHandler(wsConn, callback);

            // Send command
            DRP_Cmd sendCmd = new DRP_Cmd(cmd, serviceName, token, @params);
            wsConn.Send(Newtonsoft.Json.JsonConvert.SerializeObject(sendCmd));
        }

        // Send DRP Cmd and wait for results
        public JObject SendCmd(DRP_WebsocketConn wsConn, string serviceName, string cmd, object @params)
        {
            // Define return object
            JObject returnObject = null;

            // Define task dummy task to await return
            Task<object> ReturnDataTask = new Task<object>(() =>
            {
                return null;
            });

            // Define action to execute task
            Action returnAction = () =>
            {
                ReturnDataTask.Start();
            };

            // Send command, wait up to 30 seconds for return
            SendCmd(wsConn, serviceName, cmd, @params, data =>
            {
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
                returnAction.Invoke();
            });

            // Wait for task to complete
            ReturnDataTask.Wait(30000);

            // Return Data
            return returnObject;
        }

        public void ProcessCmd(DRP_WebsocketConn wsConn, DRP_MsgIn message)
        {
            if (message.replytoken != null && message.replytoken.Length > 0)
            {
                //thisEndpoint.SendReply(wsConn, message.replytoken, cmdResults.status, cmdResults.output);
            }
        }
        public void ProcessReply(DRP_WebsocketConn wsConn, DRP_MsgIn message)
        {
            if (wsConn.ReplyHandlerQueue.ContainsKey(message.token))
            {
                // Execute callback
                wsConn.ReplyHandlerQueue[message.token](message.payload);
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

            // See what we received
            DRP_MsgIn message = Newtonsoft.Json.JsonConvert.DeserializeObject<DRP_MsgIn>(messageArgs.Data);

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
        Dictionary<string, Action<object>> DRPCallbacks = new Dictionary<string, Action<object>>();
        public bool clientConnected = false;
        public bool clientDied = false;

        public DRP_Client(BrokerProfile brokerProfile)
        {
            // Connect to WS
            wsConn = new DRP_WebsocketConn(brokerProfile.URL, new string[] { "drp" });
            if (brokerProfile.ProxyAddress != "")
            {
                wsConn.SetProxy(brokerProfile.ProxyAddress, brokerProfile.ProxyUser, brokerProfile.ProxyPass);
            }
            //ClientWSConn.SslConfiguration.EnabledSslProtocols = System.Security.Authentication.SslProtocols.Tls12;

            wsConn.OnOpen += (sender, e) =>
                StartClientSession(wsConn, e);

            wsConn.OnMessage += (sender, e) =>
                ReceiveMessage(wsConn, e);

            wsConn.OnError += (sender, e) =>
                Console.WriteLine("Error: " + e.Message);

            wsConn.OnClose += EndClientSession;

            wsConn.Connect();
        }

        public void CloseSession()
        {
            // Close websocket
            wsConn.Close();
        }

        public void StartClientSession(DRP_WebsocketConn wsConn, EventArgs e)
        {
            // We have a connection
            //Console.WriteLine("Session open!");
            clientConnected = true;
        }

        public void EndClientSession(object sender, EventArgs e)
        {
            // The session has ended
            WebSocketSharp.CloseEventArgs closeArgs = (WebSocketSharp.CloseEventArgs)e;
            if (!clientConnected)
            {
                clientDied = true;
            }
            //Console.WriteLine("Close code: '" + closeArgs.Code + "'");
        }

        // Shortcut to execute SendCmd
        public JObject SendCmd(string cmd, object @params)
        {
            return SendCmd(wsConn, null, cmd, @params);
        }

        public async void StartDataGathering()
        {
            while (wsConn.ReadyState != WebSocketSharp.WebSocketState.Open)
            {
                await Task.Delay(TimeSpan.FromSeconds(1));
            }

            // We have an open connection - let's do stuff.

            // Create Playbook
            Playbook StartupPlaybook = new Playbook();
            StartupPlaybook.AddStep(GetCmds);

            // Complete
            StartupPlaybook.AddStep(DoneWithStartup);

            // Start the Playbook
            StartupPlaybook.Run();

        }


        // Sample call - Register
        public void GetCmds(Action nextAction)
        {
            SendCmd(wsConn, null, "getCmds", null, data =>
            {
                Newtonsoft.Json.Linq.JObject returnData = (Newtonsoft.Json.Linq.JObject)data;
                int fakeStatsRecvdMsgs = (int)returnData["fakestats"]["ReceivedMessages"];
                Console.WriteLine("FakeStats Received Messages: [{0}]", fakeStatsRecvdMsgs);
                nextAction?.Invoke();
            });
        }

        public void DoneWithStartup(Action nextAction)
        {
            Console.WriteLine("Done with startup.");
            nextAction?.Invoke();
        }
    }

    public class DRP_Cmd
    {
        public string type;
        public string cmd;
        public object @params;
        public string serviceName;
        public string replytoken;

        public DRP_Cmd(string cmdName, string serviceName, string cmdToken, object sendData)
        {
            this.type = "cmd";
            this.cmd = cmdName;
            this.@params = sendData;
            this.serviceName = serviceName;
            this.replytoken = cmdToken;
        }
    }

    public class DRP_Response
    {
        public string token;
        public string status;
        public object payload;

        public DRP_Response(string inToken, string inStatus, object inPayload)
        {
            token = inToken;
            status = inStatus;
            payload = inPayload;
        }
    }

    public class DRP_MsgIn
    {
        public string type;
        public string cmd;
        public string serviceName;
        public object @params;
        public object payload;
        public string status;
        public string token;
        public string replytoken;
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
