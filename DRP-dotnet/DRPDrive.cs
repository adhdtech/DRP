﻿using System;
using System.Data;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Collections.ObjectModel;
using System.Management.Automation;
using System.Management.Automation.Provider;
using System.Management.Automation.Runspaces;
using Newtonsoft.Json.Linq;
using System.IO;

namespace ADHDTech.DRP
{

    public class BrokerProfile
    {
        public string Alias;
        public string URL;
        public string User;
        public string Pass;
        public string ProxyAddress;
        public string ProxyUser;
        public string ProxyPass;
        public int Timeout;
    }

    [CmdletProvider("DRPProvider", ProviderCapabilities.None)]
    public class DRPProvider : NavigationCmdletProvider
    {

        public static Dictionary<string, BrokerProfile> drpURLHash = new Dictionary<string, BrokerProfile>();

        protected override Collection<PSDriveInfo> InitializeDefaultDrives()
        {
            PSDriveInfo drive = new PSDriveInfo("DRP", this.ProviderInfo, "", "", null);
            Collection<PSDriveInfo> drives = new Collection<PSDriveInfo>() { drive };
            return drives;
        }

        // Determines if the specified item exists.
        protected override bool ItemExists(string path)
        {
            // Update so that we make a DRP call and verify that the item exists
            return true;
        }

        protected override bool IsValidPath(string path)
        {
            // We don't need to verify that the path exists; just that it's syntactically valid
            bool isValidPath = true;
            //string[] pathArray = ChunkPath(path);
            return isValidPath;
        }

        // Determines if the item specified by the path is a container.
        // > test-path -container
        protected override bool IsItemContainer(string path)
        {
            // Update so that we make a DRP call and verify that the item is a container
            return true;
        }

        public class Field
        {
            public string FieldName;
            public System.Type FieldType;
            public Field(string fieldName, System.Type fieldType)
            {
                this.FieldName = fieldName;
                this.FieldType = fieldType;
            }
        }

        public DataTable ReturnTable(JObject sampleObject)
        {

            DataTable newTable = new DataTable();

            foreach (JProperty thisProperty in sampleObject.Properties())
            {
                DataColumn newColumn = new DataColumn
                {
                    DataType = typeof(string),
                    ColumnName = thisProperty.Name
                };
                newTable.Columns.Add(newColumn);
            }

            return newTable;
        }


        protected override void GetItem(string path)
        {
            string[] pathArray = ChunkPath(path);
            if (pathArray.Length == 0)
            {
                // Do nothing
            }
            else
            {
                string drpAlias = pathArray[0];
                string[] remainingPath = pathArray.Skip(1).ToArray();

                DRP_Client myDRPClient = new DRP_Client(drpURLHash[drpAlias]);
                if (!myDRPClient.Open().GetAwaiter().GetResult()) return;

                //Console.WriteLine("Connected to DRP Broker, sending pathCmd");
                object returnedData = myDRPClient.SendCmd_Async("DRP", "pathCmd", new Dictionary<string, object>() { { "method", "GetItem" }, { "pathList", remainingPath } }).GetAwaiter().GetResult();

                JObject returnObject = null;

                //Console.WriteLine("Starting callback passed to SendCmd...");
                try
                {
                    if (returnedData != null && returnedData.GetType() == typeof(JObject))
                    {
                        returnObject = (JObject)returnedData;
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("Error converting message to JObject: " + ex.Message + "\r\n<<<" + returnedData + ">>>");
                }

                if (returnObject != null)
                {
                    string returnJSONString;
                    string itemType = returnObject.GetType().ToString();
                    object returnObj;
                    if (itemType.Equals("Newtonsoft.Json.Linq.JValue"))
                    {
                        returnObj = returnObject.Value<string>();
                        returnJSONString = returnObject.Value<string>();
                    }
                    else
                    {
                        returnObj = returnObject;
                        returnJSONString = returnObject.ToString();
                    }
                    if (returnObj != null)
                    {
                        WriteItemObject(returnJSONString, this.ProviderInfo + "::" + path, false);
                    }
                    else
                    {
                        Console.WriteLine("Returned value is null!");
                    }
                }

                //WriteItemObject(returnedData, this.ProviderInfo + "::" + path, true);

                myDRPClient.CloseSession();
            }
        }

        protected override void SetItem(string path, object value)
        {
            string[] pathArray = ChunkPath(path);
            if (pathArray.Length == 0)
            {
                // Do nothing
            }
            else
            {
                //base.SetItem(path, value);
                string drpAlias = pathArray[0];
                string[] remainingPath = pathArray.Skip(1).ToArray();

                DRP_Client myDRPClient = new DRP_Client(drpURLHash[drpAlias]);
                while (myDRPClient.wsConn.ReadyState != WebSocketSharp.WebSocketState.Open && !myDRPClient.clientConnected)
                {
                    System.Threading.Thread.Sleep(100);
                }
                //JObject returnedData = myDRPClient.SendDRPCmd("cliSetItem", new List<Object> { ChunkPath(path), value });
                JObject returnedData = myDRPClient.SendCmd("pathCmd", new Dictionary<string, object>() { { "method", "SetItem" }, { "pathList", remainingPath }, { "objData", value } });

                if (returnedData["success"] != null)
                {
                    object returnObj;
                    string itemType = returnedData.GetType().ToString();
                    if (itemType.Equals("Newtonsoft.Json.Linq.JValue"))
                    {
                        returnObj = returnedData.Value<string>();
                    }
                    else
                    {
                        returnObj = returnedData;
                    }
                    if (returnObj != null)
                    {
                        Console.WriteLine("cliSetPath returned status = [" + returnObj + "]");
                        //WriteItemObject(returnObj, this.ProviderInfo + "::" + path, false);
                    }
                    else
                    {
                        Console.WriteLine("cliSetPath returned status is null!");
                    }

                }

                //WriteItemObject(returnedData, this.ProviderInfo + "::" + path, true);

                myDRPClient.CloseSession();
            }
        }

        protected override void GetChildItems(string path, bool recurse)
        {
            string[] pathArray = ChunkPath(path);
            if (pathArray.Length == 0)
            {
                // Return base Objects
                DataTable returnTable = new DataTable();
                returnTable.Columns.Add(new DataColumn("Alias", typeof(string)));
                returnTable.Columns.Add(new DataColumn("URL", typeof(string)));
                returnTable.Columns.Add(new DataColumn("User", typeof(string)));
                returnTable.Columns.Add(new DataColumn("ProxyAddress", typeof(string)));
                //returnTable.Columns.Add(new DataColumn("ProxyUser", typeof(string)));

                foreach (string key in drpURLHash.Keys)
                {
                    DataRow newRow = returnTable.NewRow();
                    newRow.SetField("Alias", key);
                    newRow.SetField("URL", drpURLHash[key].URL);
                    newRow.SetField("User", drpURLHash[key].User);
                    newRow.SetField("ProxyAddress", drpURLHash[key].ProxyAddress);
                    //newRow.SetField("ProxyUser", drpURLHash[key].ProxyUser);
                    returnTable.Rows.Add(newRow);
                }

                if (returnTable != null)
                {
                    WriteItemObject(returnTable, this.ProviderInfo + "::" + path, true);
                }
            }
            else
            {
                string drpAlias = pathArray[0];
                string[] remainingPath = pathArray.Skip(1).ToArray();

                DRP_Client myDRPClient = new DRP_Client(drpURLHash[drpAlias]);
                if (!myDRPClient.Open().GetAwaiter().GetResult()) return;

                //Console.WriteLine("Connected to DRP Broker, sending pathCmd");
                object returnedData = myDRPClient.SendCmd_Async("DRP", "pathCmd", new Dictionary<string, object>() { { "method", "GetChildItems" }, { "pathList", remainingPath } }).GetAwaiter().GetResult();

                JArray returnObject = null;

                //Console.WriteLine("Starting callback passed to SendCmd...");
                try
                {
                    if (returnedData != null && returnedData.GetType() == typeof(JArray))
                    {
                        returnObject = (JArray)returnedData;
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("Error converting message to JArray: " + ex.Message + "\r\n<<<" + returnedData + ">>>");
                }

                if (returnObject != null)
                {

                    // Return base Objects
                    DataTable returnTable = null;

                    foreach (JObject objData in (JArray)returnObject)
                    {
                        var fields = new List<Field>();

                        // Create table if null
                        if (returnTable == null)
                        {
                            returnTable = ReturnTable(objData);
                        }

                        DataRow newRow = returnTable.NewRow();
                        foreach (JProperty thisProperty in objData.Properties())
                        {
                            newRow.SetField(thisProperty.Name, thisProperty.Value.ToString());
                        }
                        returnTable.Rows.Add(newRow);
                    }

                    if (returnTable != null)
                    {
                        WriteItemObject(returnTable, this.ProviderInfo + "::" + path, true);
                    }
                }

                myDRPClient.CloseSession();
            }
        }

        protected override string NormalizeRelativePath(string path, string basePath)
        {
            return base.NormalizeRelativePath(path, basePath);
        }

        protected override void CopyItem(string path, string copyPath, bool recurse)
        {
            try
            {
                string sourceJSONString = GetItemReturnJSONString(path);
                byte[] sourceJSONBytes = new UTF8Encoding(true).GetBytes(sourceJSONString);
                // Create a FileStream that will write data to file.
                FileStream writerFileStream =
                    new FileStream(copyPath, FileMode.Create, FileAccess.Write);

                writerFileStream.Write(sourceJSONBytes, 0, sourceJSONBytes.Length);

                // Close the writerFileStream when we are done.
                writerFileStream.Close();
                //base.CopyItem(dataFileName, copyPath, recurse);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Unable to save object from DRPDrive: " + ex.Message);
            }
        }

        private string GetItemReturnJSONString(string path)
        {
            string returnJSONString = null;
            string[] pathArray = ChunkPath(path);
            if (pathArray.Length == 0)
            {
                // Do nothing
            }
            else
            {
                string drpURL = pathArray[0];
                string[] remainingPath = pathArray.Skip(1).ToArray();

                DRP_Client myDRPClient = new DRP_Client(drpURLHash[drpURL]);
                while (myDRPClient.wsConn.ReadyState != WebSocketSharp.WebSocketState.Open)
                {
                    System.Threading.Thread.Sleep(100);
                }

                //Console.WriteLine("Connected to DRP Broker!");
                JObject returnedData = myDRPClient.SendCmd("pathCmd", new Dictionary<string, object>() { { "method", "GetItem" }, { "pathList", remainingPath } });

                if (returnedData != null)
                {
                    returnJSONString = returnedData.ToString();
                    /*
                    switch (itemType) {
                        case "Newtonsoft.Json.Linq.JObject":
                            returnJSONString = 
                            break;
                        case "Newtonsoft.Json.Linq.JArray":
                            break;
                        case "Newtonsoft.Json.Linq.JValue":
                            break;
                        default:
                            break;
                    }
                    */
                }

                //WriteItemObject(returnedData, this.ProviderInfo + "::" + path, true);

                myDRPClient.CloseSession();
            }
            return returnJSONString;
        }

        private string NormalizePath(string path)
        {
            string result = path;

            if (!String.IsNullOrEmpty(path))
            {
                //result = path.Replace("/", pathSeparator);
            }

            return result;
        }

        private string[] ChunkPath(string path)
        {
            // Normalize the path before splitting
            string normalPath = NormalizePath(path);

            // Return the path with the drive name and first path 
            // separator character removed, split by the path separator.
            //string pathNoDrive = normalPath.Replace(this.PSDriveInfo.Root
            //                               + pathSeparator, "");
            normalPath = normalPath.TrimEnd(pathSeparator.ToCharArray());
            if (normalPath.Length == 0)
            {
                return new string[] { };
            }
            else
            {
                //string[] returnArr = pathNoDrive.Split(pathSeparator.ToCharArray());
                //return returnArr;
                string[] returnArr = normalPath.Split(pathSeparator.ToCharArray());
                return returnArr;
            }
        }

        private readonly string pathSeparator = "\\";

    }

    // Declare the class as a cmdlet and specify the
    // appropriate verb and noun for the cmdlet name.
    [Cmdlet(VerbsCommunications.Connect, "DRP")]
    public class ConnectDRP : Cmdlet
    {
        // Declare the parameters for the cmdlet.
        [Parameter(Mandatory = true)]
        public string URL { get; set; }

        [Parameter(Mandatory = true)]
        public string Alias { get; set; }

        [Parameter(Mandatory = false)]
        public string User { get; set; }

        [Parameter(Mandatory = false)]
        public string Pass { get; set; }

        [Parameter(Mandatory = false)]
        public string ProxyAddress { get; set; }

        [Parameter(Mandatory = false)]
        public string ProxyUser { get; set; }

        [Parameter(Mandatory = false)]
        public string ProxyPass { get; set; }

        [Parameter(Mandatory = false)]
        public int? Timeout { get; set; }

        protected override void BeginProcessing () {

            Console.WriteLine("Setting: {0} to {1}", this.Alias, this.URL);
            DRPProvider.drpURLHash[this.Alias] = new BrokerProfile
            {
                Alias = Alias,
                URL = URL,
                User = User ?? "",
                Pass = Pass ?? "",
                ProxyAddress = ProxyAddress ?? "",
                ProxyUser = ProxyUser ?? "",
                ProxyPass = ProxyPass ?? "",
                Timeout = Timeout ?? 30000
            };
        }
    }
}
