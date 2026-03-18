import azure.functions as func
from azure.storage.blob import BlobServiceClient
import pandas as pd
import io
import json
import os

app = func.FunctionApp()


@app.route(route="process_diet_data", auth_level=func.AuthLevel.ANONYMOUS)
def process_diet_data(req: func.HttpRequest) -> func.HttpResponse:
    try:
        connect_str = os.getenv("AzureWebJobsStorage")

        container_name = "datasets"
        blob_name = "All_Diets.csv"

        blob_service_client = BlobServiceClient.from_connection_string(connect_str)
        blob_client = blob_service_client.get_blob_client(
            container=container_name,
            blob=blob_name
        )

        stream = blob_client.download_blob().readall()
        df = pd.read_csv(io.BytesIO(stream)).copy()

        # Clean numeric columns
        numeric_cols = ["Protein(g)", "Carbs(g)", "Fat(g)"]
        df[numeric_cols] = df[numeric_cols].apply(pd.to_numeric, errors="coerce")
        df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].mean())

        # Average macros per diet
        avg_macros = df.groupby("Diet_type")[numeric_cols].mean().reset_index()
        avg_macros[numeric_cols] = avg_macros[numeric_cols].round(2)

        # Top 5 protein recipes per diet
        top_protein = (
            df.sort_values("Protein(g)", ascending=False)
            .groupby("Diet_type", group_keys=False)
            .head(5)[
                ["Diet_type", "Recipe_name", "Cuisine_type",
                 "Protein(g)", "Carbs(g)", "Fat(g)"]
            ]
        )

        # Highest protein recipe overall
        highest_protein_recipe = df.loc[
            df["Protein(g)"].idxmax(),
            ["Diet_type", "Recipe_name", "Cuisine_type", "Protein(g)"]
        ].to_dict()

        # Most common cuisines per diet
        cuisine_counts = (
            df.groupby(["Diet_type", "Cuisine_type"])
            .size()
            .reset_index(name="count")
        )

        most_common_cuisines = (
            cuisine_counts.sort_values(["Diet_type", "count"], ascending=[True, False])
            .groupby("Diet_type", group_keys=False)
            .head(3)
        )

        # Ratios
        df["Protein_to_Carbs_ratio"] = df["Protein(g)"] / df["Carbs(g)"].replace(0, pd.NA)
        df["Carbs_to_Fat_ratio"] = df["Carbs(g)"] / df["Fat(g)"].replace(0, pd.NA)

        ratios_sample = df[
            [
                "Diet_type", "Recipe_name", "Cuisine_type",
                "Protein(g)", "Carbs(g)", "Fat(g)",
                "Protein_to_Carbs_ratio", "Carbs_to_Fat_ratio"
            ]
        ].head(50)

        ratios_sample = ratios_sample.where(pd.notnull(ratios_sample), None)

        # Chart-ready data
        bar_chart = avg_macros.to_dict(orient="records")

        heatmap = {
            "xLabels": ["Protein(g)", "Carbs(g)", "Fat(g)"],
            "yLabels": avg_macros["Diet_type"].tolist(),
            "values": avg_macros[numeric_cols].values.tolist(),
        }

        scatter_chart = top_protein.to_dict(orient="records")

        response_data = {
            "summary": {
                "total_records": int(len(df)),
                "diet_types": int(df["Diet_type"].nunique()),
                "highest_protein_recipe": highest_protein_recipe,
            },
            "avg_macros": avg_macros.to_dict(orient="records"),
            "top_protein_recipes": top_protein.to_dict(orient="records"),
            "most_common_cuisines": most_common_cuisines.to_dict(orient="records"),
            "ratios_sample": ratios_sample.to_dict(orient="records"),
            "charts": {
                "bar_chart": bar_chart,
                "heatmap": heatmap,
                "scatter_chart": scatter_chart,
            },
        }

        return func.HttpResponse(
            json.dumps(response_data, default=str),
            mimetype="application/json",
            status_code=200,
        )

    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )