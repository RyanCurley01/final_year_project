# audio_service/routes/visualization.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
import json

# Import the entire module to ensure we access the latest global state
# because ml_service reassigns these variables during startup
import ml_service

router = APIRouter()

# ============================================
# VISUALIZATION ENDPOINTS
# ============================================

# EXECUTION ORDER: Router endpoint.
@router.get("/visualize", response_class=HTMLResponse)
async def visualize_clusters():
    """
    Returns an HTML page visualizing the audio feature clusters using Plotly.
    Useful for debugging and verifying that genres are clustering correctly.
    """
    # Access via module to get latest value
    if not ml_service.visualization_data:
         return "<html><body><h1>No Model visualization available (Model has not trained yet or cache is empty)</h1></body></html>"
    
    # Extract data for template
    vd = ml_service.visualization_data
    
    html_content = f"""
    <html>
        <head>
            <title>Audio Features Visualization</title>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <style>
                body {{ font-family: sans-serif; padding: 20px; }}
            </style>
        </head>
        <body>
            <h2>Audio Feature Clusters (PCA Projection)</h2>
            <div id="myDiv" style="width:100%;height:600px"></div>
            <script>
                var x = {json.dumps(vd['x'])};
                var y = {json.dumps(vd['y'])};
                var genres = {json.dumps(vd['genres'])};
                var metrics = {json.dumps(vd['metrics'])};
                
                // Group data by genre for better legend
                var traces = [];
                var genreGroups = {{}};
                
                for(var i=0; i<x.length; i++) {{
                    var g = genres[i];
                    if(!genreGroups[g]) genreGroups[g] = {{x:[], y:[], text:[]}};
                    genreGroups[g].x.push(x[i]);
                    genreGroups[g].y.push(y[i]);
                    genreGroups[g].text.push(g);
                }}
                
                for(var g in genreGroups) {{
                    traces.push({{
                        x: genreGroups[g].x,
                        y: genreGroups[g].y,
                        mode: 'markers',
                        type: 'scatter',
                        name: g,
                        text: genreGroups[g].text,
                        marker: {{ size: 10 }}
                    }});
                }}

                var layout = {{
                    title: 'Audio Feature Space (2D PCA) - Best Scaler: {vd['scaler']}',
                    xaxis: {{ 
                        title: 'PCA Component 1',
                        showgrid: true,
                        zeroline: true,
                        showline: true,
                        showticklabels: true,
                        ticks: 'outside',
                        tickmode: 'auto',
                        nticks: 10,
                        tickfont: {{
                            size: 12,
                            color: '#ffffff'
                        }},
                        linecolor: '#ffffff',
                        gridcolor: 'rgba(255,255,255,0.2)'
                    }},
                    yaxis: {{ 
                        title: 'PCA Component 2',
                        showgrid: true,
                        zeroline: true,
                        showline: true,
                        showticklabels: true,
                        ticks: 'outside',
                        tickmode: 'auto',
                        nticks: 10,
                        tickfont: {{
                            size: 12,
                            color: '#ffffff'
                        }},
                        linecolor: '#ffffff',
                        gridcolor: 'rgba(255,255,255,0.2)'
                    }},
                    hovermode: 'closest',
                    plot_bgcolor: '#1e293b',
                    paper_bgcolor: '#0f172a',
                    font: {{
                        color: '#ffffff'
                    }}
                }};

                Plotly.newPlot('myDiv', traces, layout);
            </script>
            <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin-top: 20px;">
                <h3>Model Metrics</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background: #ddd;">
                        <th style="padding: 8px; text-align: left;">Scaler</th>
                        <th style="padding: 8px; text-align: left;">Training Score</th>
                        <th style="padding: 8px; text-align: left;">Validation Score</th>
                    </tr>
                    <tr>
                        <td style="padding: 8px;"><strong>MinMaxScaler</strong></td>
                        <td style="padding: 8px;">{vd['metrics'].get('MinMaxScaler_train', 'N/A')}</td>
                        <td style="padding: 8px;">{vd['metrics'].get('MinMaxScaler_val', 'N/A')}</td>
                    </tr>
                    <tr style="background: #f8f8f8;">
                        <td style="padding: 8px;"><strong>StandardScaler</strong></td>
                        <td style="padding: 8px;">{vd['metrics'].get('StandardScaler_train', 'N/A')}</td>
                        <td style="padding: 8px;">{vd['metrics'].get('StandardScaler_val', 'N/A')}</td>
                    </tr>
                </table>
                <p style="margin-top: 10px;"><em>Higher silhouette score indicates better separation between genres. Training vs Validation scores help detect overfitting.</em></p>
            </div>
        </body>
    </html>
    """
    return html_content

# EXECUTION ORDER: Router endpoint.
@router.get("/api/visualization/data")
async def get_visualization_data():
    """
    Returns visualization data as JSON for frontend consumption
    """
    if not ml_service.visualization_data:
        raise HTTPException(status_code=404, detail="No visualization data available. Model has not been trained yet or cache is empty.")
    
    return {
        "x": ml_service.visualization_data['x'],
        "y": ml_service.visualization_data['y'],
        "genres": ml_service.visualization_data['genres'],
        "scaler": ml_service.visualization_data['scaler'],
        "metrics": ml_service.visualization_data['metrics']
    }
