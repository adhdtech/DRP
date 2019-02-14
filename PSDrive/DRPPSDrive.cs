using System;
using System.Data;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Collections.ObjectModel;
using System.Management.Automation;
using System.Management.Automation.Provider;
using Newtonsoft.Json.Linq;

namespace ADHDTech.DRP
{
    [CmdletProvider("DRPProvider", ProviderCapabilities.None)]
    public class DRPProvider : NavigationCmdletProvider
    {

        protected override Collection<PSDriveInfo> InitializeDefaultDrives()
        {
            PSDriveInfo drive = new PSDriveInfo("DRP", this.ProviderInfo, "", "", null);
            Collection<PSDriveInfo> drives = new Collection<PSDriveInfo>() { drive };
            return drives;
        }

        protected override bool ItemExists(string path)
        {
            bool isContainer = false;
            return true;

            DRPClient myDRPClient = new DRPClient(@"ws://localhost:8082/consumer");

            while (myDRPClient.ClientWSConn.ReadyState != WebSocketSharp.WebSocketState.Open)
            {
                System.Threading.Thread.Sleep(100);
            }

            JObject returnedData = myDRPClient.SendDRPCmd("cliGetItem", ChunkPath(path));
            JObject returnItem = (JObject)returnedData["item"];
            if (returnItem["Type"].Value<string>() == "Array" || returnItem["Type"].Value<string>() == "Object")
            {
                isContainer = true;
            }

            myDRPClient.CloseSession();

            return isContainer;
        }

        protected override bool IsValidPath(string path)
        {
            bool isValidPath = false;

            DRPClient myDRPClient = new DRPClient(@"ws://localhost:8082/consumer");

            while (myDRPClient.ClientWSConn.ReadyState != WebSocketSharp.WebSocketState.Open)
            {
                System.Threading.Thread.Sleep(100);
            }

            JObject returnedData = myDRPClient.SendDRPCmd("cliGetItem", ChunkPath(path));

            if (returnedData["item"].Value<string>() != null)
            {
                isValidPath = true;
            }

            myDRPClient.CloseSession();

            return isValidPath;
        }

        protected override bool IsItemContainer(string path)
        {

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
                DataColumn newColumn = new DataColumn();
                newColumn.DataType = typeof(string);  //thisProperty.Value.GetType();
                newColumn.ColumnName = thisProperty.Name;
                newTable.Columns.Add(newColumn);
            }

            return newTable;
        }

        
        protected override void GetItem(string path)
        {
            DRPClient myDRPClient = new DRPClient(@"ws://localhost:8082/consumer");
            //rSageHiveClient myHiveClient = new rSageHiveClient(@"wss://rsage.autozone.com/vdm");
            while (myDRPClient.ClientWSConn.ReadyState != WebSocketSharp.WebSocketState.Open)
            {
                System.Threading.Thread.Sleep(100);
            }

            //Console.WriteLine("Connected to DRP Broker!");

            JObject returnedData = myDRPClient.SendDRPCmd("cliGetItem", ChunkPath(path));

            // Return base Objects
            /*
            DataTable returnTable = null;

            foreach (JObject objData in (JArray)returnedData["item"])
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
            */

            
            if (returnedData["item"] != null)
            {
                object returnObj;
                string itemType = returnedData["item"].GetType().ToString();
                if (itemType.Equals("Newtonsoft.Json.Linq.JValue"))
                {
                    returnObj = returnedData["item"].Value<string>();
                }
                else
                {
                    returnObj = returnedData["item"];
                }
                if (returnObj != null) {
                    WriteItemObject(returnObj, this.ProviderInfo + "::" + path, false);
                } else {
                    Console.WriteLine("Returned value is null!");
                }
            }
            
            //WriteItemObject(returnedData, this.ProviderInfo + "::" + path, true);

            myDRPClient.CloseSession();
        }
        /*
        protected override void SetItem(string path, object value)
        {
            base.SetItem(path, value);
        }
        */

        protected override void GetChildItems(string path, bool recurse)
        {
            DRPClient myDRPClient = new DRPClient(@"ws://localhost:8082/consumer");
            //rSageHiveClient myHiveClient = new rSageHiveClient(@"wss://rsage.autozone.com/vdm");
            while (myDRPClient.ClientWSConn.ReadyState != WebSocketSharp.WebSocketState.Open)
            {
                System.Threading.Thread.Sleep(100);
            }

            //Console.WriteLine("Connected to DRP Broker!");
            string[] chunkedPath = ChunkPath(path);
            JObject returnedData = myDRPClient.SendDRPCmd("cliGetPath", chunkedPath);

            if (returnedData != null && returnedData.ContainsKey("pathItems")) {

                // Return base Objects
                DataTable returnTable = null;

                foreach (JObject objData in (JArray)returnedData["pathItems"])
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

        protected override string NormalizeRelativePath(string path, string basePath)
        {
            return base.NormalizeRelativePath(path, basePath);
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

        private string pathSeparator = "\\";

    }
}
