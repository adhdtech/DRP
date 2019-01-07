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

        protected override bool IsValidPath(string path)
        {
            return true;
        }

        protected override Collection<PSDriveInfo> InitializeDefaultDrives()
        {
            PSDriveInfo drive = new PSDriveInfo("DRP", this.ProviderInfo, "", "", null);
            Collection<PSDriveInfo> drives = new Collection<PSDriveInfo>() { drive };
            return drives;
        }

        protected override bool ItemExists(string path)
        {
            return true;
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

            // Create a new DataTable titled 'Names.'


            // Add three column objects to the table.

            /*
            DataColumn fNameColumn = new DataColumn();
            fNameColumn.DataType = System.Type.GetType("System.String");
            fNameColumn.ColumnName = "Fname";
            fNameColumn.DefaultValue = "Fname";
            namesTable.Columns.Add(fNameColumn);

            DataColumn lNameColumn = new DataColumn();
            lNameColumn.DataType = System.Type.GetType("System.String");
            lNameColumn.ColumnName = "LName";
            namesTable.Columns.Add(lNameColumn);

            // Create an array for DataColumn objects.
            DataColumn[] keys = new DataColumn[1];
            keys[0] = idColumn;
            namesTable.PrimaryKey = keys;
            */
            // Return the new DataTable.
            return newTable;
        }

        /*
        protected override void GetItem(string path)
        {
            base.GetItem(path);
        }

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

            JObject returnedData = myDRPClient.SendDRPCmd("cliGetPath", ChunkPath(path));

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
            //WriteItemObject("Hello", "Hello", true);

            myDRPClient.CloseSession();
        }

        private static Dictionary<string, DRPBaseObject> _CortexDict = new Dictionary<string, DRPBaseObject>
        {
            {"Objects", new DRPBaseObject("Objects","Aggregated Objects",5) },
            {"Managers", new DRPBaseObject("Managers","Object Managers",5) },
            {"Hive", new DRPBaseObject("Hive","Hive Data",5) }
        };

        private string NormalizePath(string path)
        {
            string result = path;

            if (!String.IsNullOrEmpty(path))
            {
                result = path.Replace("/", pathSeparator);
            }

            return result;
        }

        private string[] ChunkPath(string path)
        {
            // Normalize the path before splitting
            string normalPath = NormalizePath(path);

            // Return the path with the drive name and first path 
            // separator character removed, split by the path separator.
            string pathNoDrive = normalPath.Replace(this.PSDriveInfo.Root
                                           + pathSeparator, "");

            if (pathNoDrive.Length == 0)
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

    class DRPBaseObject
    {
        public string Name;
        public string Type;
        public int ChildItemCount;
        public DRPBaseObject(string newName, string newType, int newCount)
        {
            Name = newName;
            Type = newType;
            ChildItemCount = newCount;
        }
    }
}
