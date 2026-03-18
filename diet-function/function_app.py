import azure.functions as func
from azure.storage.blob import BlobServiceClient
import pandas as pd
import io
import json
import os

def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        connect_str = os.getenv("AzureWebJobsStorage")

        container_name = "datasets"
        blob_name = "All_Diets.csv"

        blob_service_client = BlobServiceClient.from_connection_string(connect_str)
        container_client = blob_service_client.get_container_client(container_name)
        blob_client = container_client.get_blob_client(blob_name)

        stream = blob_client.download_blob().readall()
        df = pd.read_csv(io.BytesIO(stream))

        avg_macros = df.groupby('Diet_type')[['Protein(g)', 'Carbs(g)', 'Fat(g)']].mean()

        result = avg_macros.reset_index().to_dict(orient='records')

        return func.HttpResponse(
            json.dumps(result),
            mimetype="application/json"
        )

    except Exception as e:
        return func.HttpResponse(str(e), status_code=500)