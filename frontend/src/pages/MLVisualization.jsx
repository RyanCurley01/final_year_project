import { useEffect, useState } from 'react';
import axios from 'axios';

const MLVisualization = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchVisualizationData = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/visualization/data');
        setData(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load visualization data. Make sure the model has been trained.');
        setLoading(false);
      }
    };

    fetchVisualizationData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
        <p className="mt-4 text-gray-400">Loading visualization data...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="bg-red-500/20 p-6 rounded-lg">
          <h2 className="text-xl font-bold text-red-500 mb-2">Error</h2>
          <p className="text-gray-300">{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  // Process data for visualization
  const { x, y, genres, scaler, metrics } = data;
  
  // Group data by genre
  const genreGroups = {};
  x.forEach((xVal, i) => {
    const genre = genres[i];
    if (!genreGroups[genre]) {
      genreGroups[genre] = { x: [], y: [] };
    }
    genreGroups[genre].x.push(xVal);
    genreGroups[genre].y.push(y[i]);
  });

  // Calculate chart dimensions - keep actual values, 0 where axes meet
  const dataXMin = Math.min(...x);
  const dataXMax = Math.max(...x);
  const dataYMin = Math.min(...y);
  const dataYMax = Math.max(...y);
  
  // Extend range to include 0 if not already included
  const xMin = Math.floor(Math.min(dataXMin, 0));
  const xMax = Math.ceil(Math.max(dataXMax, 0));
  const yMin = Math.floor(Math.min(dataYMin, 0));
  const yMax = Math.ceil(Math.max(dataYMax, 0));
  
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  
  const padding = 50;
  const chartWidth = 800;
  const chartHeight = 600;

  // Scale functions - actual values, 0 at correct position
  const scaleX = (val) => ((val - xMin) / xRange) * (chartWidth - 2 * padding) + padding;
  const scaleY = (val) => chartHeight - (((val - yMin) / yRange) * (chartHeight - 2 * padding) + padding);

  // Color palette for genres
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
  ];

  const genreColors = {};
  Object.keys(genreGroups).forEach((genre, i) => {
    genreColors[genre] = colors[i % colors.length];
  });

  return (
    <div className="flex flex-col p-6 min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="max-w-6xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-white mb-2">Audio Feature Clusters</h1>
        <p className="text-gray-400 mb-6">2D PCA Projection - Best Scaler: {scaler}</p>
        
        {/* Chart */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mb-6">
          <svg width={chartWidth} height={chartHeight} className="w-full h-auto">
            {/* Grid lines */}
            <g className="grid">
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                const xPos = padding + fraction * (chartWidth - 2 * padding);
                const yPos = padding + fraction * (chartHeight - 2 * padding);
                return (
                  <g key={fraction}>
                    <line
                      x1={xPos}
                      y1={padding}
                      x2={xPos}
                      y2={chartHeight - padding}
                      stroke="#374151"
                      strokeWidth="1"
                      strokeDasharray="4"
                    />
                    <line
                      x1={padding}
                      y1={yPos}
                      x2={chartWidth - padding}
                      y2={yPos}
                      stroke="#374151"
                      strokeWidth="1"
                      strokeDasharray="4"
                    />
                  </g>
                );
              })}
            </g>

            {/* X-axis through y=0 */}
            <line
              x1={padding}
              y1={scaleY(0)}
              x2={chartWidth - padding}
              y2={scaleY(0)}
              stroke="#9CA3AF"
              strokeWidth="2"
            />
            {/* Y-axis through x=0 */}
            <line
              x1={scaleX(0)}
              y1={padding}
              x2={scaleX(0)}
              y2={chartHeight - padding}
              stroke="#9CA3AF"
              strokeWidth="2"
            />

            {/* X-axis tick marks and labels - every 1 unit */}
            {(() => {
              const ticks = [];
              const tickInterval = 1;
              for (let val = xMin; val <= xMax; val += tickInterval) {
                ticks.push(val);
              }
              return ticks.map((val) => {
                const xPos = scaleX(val);
                const yAxisPos = scaleY(0);
                return (
                  <g key={`x-${val}`}>
                    <line
                      x1={xPos}
                      y1={yAxisPos - 5}
                      x2={xPos}
                      y2={yAxisPos + 5}
                      stroke="#9CA3AF"
                      strokeWidth="2"
                    />
                    <text
                      x={xPos}
                      y={yAxisPos + 20}
                      textAnchor="middle"
                      fill="#9CA3AF"
                      fontSize="12"
                    >
                      {val}
                    </text>
                  </g>
                );
              });
            })()}

            {/* Y-axis tick marks and labels - every 1 unit */}
            {(() => {
              const ticks = [];
              const tickInterval = 1;
              for (let val = yMin; val <= yMax; val += tickInterval) {
                ticks.push(val);
              }
              return ticks.map((val) => {
                const yPos = scaleY(val);
                const xAxisPos = scaleX(0);
                return (
                  <g key={`y-${val}`}>
                    <line
                      x1={xAxisPos - 5}
                      y1={yPos}
                      x2={xAxisPos + 5}
                      y2={yPos}
                      stroke="#9CA3AF"
                      strokeWidth="2"
                    />
                    <text
                      x={xAxisPos - 15}
                      y={yPos + 4}
                      textAnchor="end"
                      fill="#9CA3AF"
                      fontSize="12"
                    >
                      {val}
                    </text>
                  </g>
                );
              });
            })()}

            {/* Data points - use original genre groups */}
            {Object.entries(genreGroups).map(([genre, points]) => (
              <g key={genre}>
                {points.x.map((xVal, i) => (
                  <circle
                    key={i}
                    cx={scaleX(xVal)}
                    cy={scaleY(points.y[i])}
                    r="5"
                    fill={genreColors[genre]}
                    opacity="0.7"
                    className="hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <title>{genre}</title>
                  </circle>
                ))}
              </g>
            ))}

            {/* Axis labels */}
            <text
              x={chartWidth / 2}
              y={chartHeight - 10}
              textAnchor="middle"
              fill="#9CA3AF"
              fontSize="14"
            >
              PCA Component 1
            </text>
            <text
              x={15}
              y={chartHeight / 2}
              textAnchor="middle"
              fill="#9CA3AF"
              fontSize="14"
              transform={`rotate(-90, 15, ${chartHeight / 2})`}
            >
              PCA Component 2
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Genres</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Object.entries(genreColors).map(([genre, color]) => (
              <div key={genre} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm text-gray-300">{genre}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Model Metrics */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Model Metrics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="pb-3 text-gray-400 font-medium">Scaler</th>
                  <th className="pb-3 text-gray-400 font-medium">Training Score</th>
                  <th className="pb-3 text-gray-400 font-medium">Validation Score</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-700/50">
                  <td className="py-3 text-white font-semibold">MinMaxScaler</td>
                  <td className="py-3 text-gray-300">{metrics.MinMaxScaler_train !== undefined && metrics.MinMaxScaler_train !== null ? metrics.MinMaxScaler_train : 'N/A'}</td>
                  <td className="py-3 text-gray-300">{metrics.MinMaxScaler_val !== undefined && metrics.MinMaxScaler_val !== null ? metrics.MinMaxScaler_val : 'N/A'}</td>
                </tr>
                <tr>
                  <td className="py-3 text-white font-semibold">StandardScaler</td>
                  <td className="py-3 text-gray-300">{metrics.StandardScaler_train !== undefined && metrics.StandardScaler_train !== null ? metrics.StandardScaler_train : 'N/A'}</td>
                  <td className="py-3 text-gray-300">{metrics.StandardScaler_val !== undefined && metrics.StandardScaler_val !== null ? metrics.StandardScaler_val : 'N/A'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-400 mt-4">
            <strong>Note:</strong> Higher silhouette score indicates better separation between genres. 
            Training vs Validation scores help detect overfitting.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MLVisualization;
