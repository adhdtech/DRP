using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace ADHDTech.DRP
{
    public class DRPClient
    {
        public WebSocketSharp.WebSocket ClientWSConn;
        Dictionary<string, Action<object>> DRPCallbacks = new Dictionary<string, Action<object>>();
        public bool clientConnected = false;
        public bool clientDied = false;

        public DRPClient(BrokerProfile brokerProfile)
        {
            // Connect to WS
            ClientWSConn = new WebSocketSharp.WebSocket(brokerProfile.URL);
            if (brokerProfile.ProxyAddress != "") {
                ClientWSConn.SetProxy(brokerProfile.ProxyAddress, brokerProfile.ProxyUser, brokerProfile.ProxyPass);
            }
            //ClientWSConn.SslConfiguration.EnabledSslProtocols = System.Security.Authentication.SslProtocols.Tls12;

            ClientWSConn.OnOpen += StartClientSession;

            ClientWSConn.OnMessage += ProcessMessage;

            ClientWSConn.OnError += (sender, e) =>
                Console.WriteLine("Error: " + e.Message);

            ClientWSConn.OnClose += EndClientSession;

            ClientWSConn.Connect();
        }

        public void CloseSession()
        {
            // Close websocket
            ClientWSConn.Close();
        }

        public void StartClientSession(object sender, EventArgs e)
        {
            // We have a connection
            //Console.WriteLine("Session open!");
            clientConnected = true;
        }

        public void ProcessMessage(object sender, EventArgs e)
        {
            // We received data
            WebSocketSharp.MessageEventArgs messageArgs = (WebSocketSharp.MessageEventArgs)e;
            DRP_Response recvCmd = Newtonsoft.Json.JsonConvert.DeserializeObject<DRP_Response>(messageArgs.Data);
            if (DRPCallbacks.ContainsKey(recvCmd.token))
            {
                // Execute callback
                DRPCallbacks[recvCmd.token](recvCmd.payload);
                DRPCallbacks.Remove(recvCmd.token);
            }
            else
            {
                // Bad token
                Console.WriteLine("Received command token with no pending callback -> [{0}]", recvCmd.token);
            }
        }

        public void EndClientSession(object sender, EventArgs e)
        {
            // The session has ended
            WebSocketSharp.CloseEventArgs closeArgs = (WebSocketSharp.CloseEventArgs)e;
            if (!clientConnected) {
                clientDied = true;
            }
            //Console.WriteLine("Close code: '" + closeArgs.Code + "'");
        }

        public async void StartDataGathering()
        {
            while (ClientWSConn.ReadyState != WebSocketSharp.WebSocketState.Open)
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
            SendDRPCmd("getCmds", null, data => {
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

        // Send DRPCmd and specify callback
        public void SendDRPCmd(string cmd, object @params, Action<object> callback)
        {
            // Generate token
            string token = Guid.NewGuid().ToString();

            // Queue callback
            DRPCallbacks[token] = callback;

            // Send command
            DRP_Cmd sendCmd = new DRP_Cmd(cmd, token, @params);
            ClientWSConn.Send(Newtonsoft.Json.JsonConvert.SerializeObject(sendCmd));
        }

        // Send DRP Cmd and wait for results
        public JObject SendDRPCmd(string cmd, object @params)
        {
            // Define return object
            JObject returnObject = null;

            // Define task dummy task to await return
            Task<object> ReturnDataTask = new Task<object>(() => {
                return null;
            });

            // Define action to execute task
            Action returnAction = () => {
                ReturnDataTask.Start();
            };

            SendDRPCmd(cmd, @params, data => {
                try
                {
                    if (data.GetType() == typeof(JObject)) {
                        JObject returnData = (JObject)data;
                        returnObject = returnData;
                    }
                } catch (Exception ex) {
                    Console.Error.WriteLine("Error converting message to JObject: " + ex.Message + "\r\n<<<" + data + ">>>");
                }
                returnAction.Invoke();
            });

            // Wait for task to complete
            ReturnDataTask.Wait(30000);

            // Return Data
            return returnObject;
        }
    }

    public class DRP_Cmd
    {
        public string type;
        public string cmd;
        public object @params;
        public string replytoken;

        public DRP_Cmd(string cmdName, string cmdToken, object sendData)
        {
            type = "cmd";
            cmd = cmdName;
            @params = sendData;
            replytoken = cmdToken;
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
