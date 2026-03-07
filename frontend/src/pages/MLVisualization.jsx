import { useEffect, useState } from 'react';
import axios from 'axios';
import envConfig from '../config/environment';

const MLVisualization = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchVisualizationData = async () => {
      try {
        const response = await axios.get(`${envConfig.getApiBaseUrl()}/api/visualization/data`);
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
  const { x, y, genres, scaler, metrics, decision_boundary, model_boundaries, per_model_metrics } = data;
  
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

  const bestModel = metrics.best_model || null;

  // Reusable chart component for rendering a decision boundary map with data points
  const ModelChart = ({ title, subtitle, boundary, accentColor, modelMetrics, badgeText, isBest }) => (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mb-6">
      <div className="flex items-center gap-3 mb-1">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {badgeText && (
          <span className="text-xs px-3 py-1 rounded-full font-medium border" style={{ 
            backgroundColor: `${accentColor}20`, 
            color: accentColor, 
            borderColor: `${accentColor}50` 
          }}>
            {badgeText}
          </span>
        )}
        {isBest && (
          <span className="text-xs px-3 py-1 rounded-full font-bold border bg-yellow-500/20 text-yellow-300 border-yellow-500/50">
            ★ Selected — Highest Validation Score
          </span>
        )}
      </div>
      {subtitle && <p className="text-gray-400 text-sm mb-4">{subtitle}</p>}
      
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet" className="w-full h-auto">
        {/* Grid lines */}
        <g className="grid">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const xPos = padding + fraction * (chartWidth - 2 * padding);
            const yPos = padding + fraction * (chartHeight - 2 * padding);
            return (
              <g key={fraction}>
                <line x1={xPos} y1={padding} x2={xPos} y2={chartHeight - padding} stroke="#374151" strokeWidth="1" strokeDasharray="4" />
                <line x1={padding} y1={yPos} x2={chartWidth - padding} y2={yPos} stroke="#374151" strokeWidth="1" strokeDasharray="4" />
              </g>
            );
          })}
        </g>

        {/* Axes through 0 */}
        <line x1={padding} y1={scaleY(0)} x2={chartWidth - padding} y2={scaleY(0)} stroke="#9CA3AF" strokeWidth="2" />
        <line x1={scaleX(0)} y1={padding} x2={scaleX(0)} y2={chartHeight - padding} stroke="#9CA3AF" strokeWidth="2" />

        {/* X-axis ticks */}
        {(() => {
          const ticks = [];
          for (let val = xMin; val <= xMax; val += 1) ticks.push(val);
          return ticks.map((val) => (
            <g key={`x-${val}`}>
              <line x1={scaleX(val)} y1={scaleY(0) - 5} x2={scaleX(val)} y2={scaleY(0) + 5} stroke="#9CA3AF" strokeWidth="2" />
              <text x={scaleX(val)} y={scaleY(0) + 20} textAnchor="middle" fill="#9CA3AF" fontSize="12">{val}</text>
            </g>
          ));
        })()}

        {/* Y-axis ticks */}
        {(() => {
          const ticks = [];
          for (let val = yMin; val <= yMax; val += 1) ticks.push(val);
          return ticks.map((val) => (
            <g key={`y-${val}`}>
              <line x1={scaleX(0) - 5} y1={scaleY(val)} x2={scaleX(0) + 5} y2={scaleY(val)} stroke="#9CA3AF" strokeWidth="2" />
              <text x={scaleX(0) - 15} y={scaleY(val) + 4} textAnchor="end" fill="#9CA3AF" fontSize="12">{val}</text>
            </g>
          ));
        })()}

        {/* Decision Boundaries */}
        {boundary && (() => {
          const { x_min: gxMin, x_max: gxMax, y_min: gyMin, y_max: gyMax, grid_res, labels } = boundary;
          const cellW = (chartWidth - 2 * padding) * ((gxMax - gxMin) / grid_res) / xRange;
          const cellH = (chartHeight - 2 * padding) * ((gyMax - gyMin) / grid_res) / yRange;
          const boundaryColorMap = {};
          Object.entries(genreColors).forEach(([genre, hex]) => {
            const num = parseInt(genre.replace('Cluster ', ''));
            if (!isNaN(num)) {
              const r = parseInt(hex.slice(1, 3), 16);
              const g = parseInt(hex.slice(3, 5), 16);
              const b = parseInt(hex.slice(5, 7), 16);
              boundaryColorMap[num] = `rgba(${r},${g},${b},0.2)`;
            }
          });
          const cells = [];
          for (let row = 0; row < grid_res; row++) {
            for (let col = 0; col < grid_res; col++) {
              const gx = gxMin + (col / grid_res) * (gxMax - gxMin);
              const gy = gyMin + (row / grid_res) * (gyMax - gyMin);
              const label = labels[row * grid_res + col];
              cells.push(
                <rect key={`db-${row}-${col}`} x={scaleX(gx)} y={scaleY(gy + (gyMax - gyMin) / grid_res)}
                  width={Math.ceil(cellW + 1)} height={Math.ceil(cellH + 1)}
                  fill={boundaryColorMap[label] || 'rgba(128,128,128,0.1)'} />
              );
            }
          }
          return <g className="decision-boundary">{cells}</g>;
        })()}

        {/* Data points */}
        {Object.entries(genreGroups).map(([genre, points]) => (
          <g key={genre}>
            {points.x.map((xVal, i) => (
              <circle key={i} cx={scaleX(xVal)} cy={scaleY(points.y[i])} r="5"
                fill={genreColors[genre]} opacity="0.7"
                className="hover:opacity-100 transition-opacity cursor-pointer">
                <title>{genre}</title>
              </circle>
            ))}
          </g>
        ))}

        {/* Axis labels */}
        <text x={chartWidth / 2} y={chartHeight - 10} textAnchor="middle" fill="#9CA3AF" fontSize="14">PCA Component 1</text>
        <text x={15} y={chartHeight / 2} textAnchor="middle" fill="#9CA3AF" fontSize="14"
          transform={`rotate(-90, 15, ${chartHeight / 2})`}>PCA Component 2</text>
      </svg>

      {/* Per-model metrics cards — unique train/val + test metrics per model */}
      {modelMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h4 className="text-gray-400 text-sm mb-1">Training Score</h4>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>{modelMetrics.train_score !== undefined ? modelMetrics.train_score : 'N/A'}</p>
            <p className="text-xs text-gray-500">Cross-validated training accuracy</p>
          </div>

          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h4 className="text-gray-400 text-sm mb-1">Validation Score</h4>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>{modelMetrics.val_score !== undefined ? modelMetrics.val_score : 'N/A'}</p>
            <p className="text-xs text-gray-500">Cross-validated validation accuracy</p>
          </div>

          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h4 className="text-gray-400 text-sm mb-1">Test Score</h4>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>{modelMetrics.test_acc !== undefined ? modelMetrics.test_acc : 'N/A'}</p>
            <p className="text-xs text-gray-500">Test Set Accuracy</p>
          </div>

          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h4 className="text-gray-400 text-sm mb-1">Silhouette Score</h4>
            <p className="text-2xl font-bold text-white">{modelMetrics.silhouette_score !== undefined ? modelMetrics.silhouette_score : 'N/A'}</p>
            <p className="text-xs text-gray-500">Cluster separation (-1 to 1)</p>
          </div>

          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h4 className="text-gray-400 text-sm mb-1">Optimal K</h4>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>{modelMetrics.optimal_k !== undefined ? modelMetrics.optimal_k : 'N/A'}</p>
            <p className="text-xs text-gray-500">Clusters used by this model</p>
          </div>

          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h4 className="text-gray-400 text-sm mb-1">Precision</h4>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>{modelMetrics.precision !== undefined ? modelMetrics.precision : 'N/A'}</p>
            <p className="text-xs text-gray-500">Weighted Average</p>
          </div>

          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h4 className="text-gray-400 text-sm mb-1">Recall</h4>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>{modelMetrics.recall !== undefined ? modelMetrics.recall : 'N/A'}</p>
            <p className="text-xs text-gray-500">Weighted Average</p>
          </div>

          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h4 className="text-gray-400 text-sm mb-1">F1 Score</h4>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>{modelMetrics.f1_score !== undefined ? modelMetrics.f1_score : 'N/A'}</p>
            <p className="text-xs text-gray-500">Weighted Average</p>
          </div>
        </div>
      )}

      {/* Cluster Legend */}
      <div className="mt-4">
        <h4 className="text-sm font-semibold text-white mb-3">Clusters</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {Object.entries(genreColors).map(([genre, clr]) => (
            <div key={genre} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: clr }} />
              <span className="text-xl text-gray-300">{genre}</span>
            </div>
          ))}
        </div>
      </div>


    </div>
  );

  // Model definitions for rendering individual charts
  const modelConfigs = [
    { key: 'KNN', title: 'KNN', subtitle: 'K-Nearest Neighbors — Distance-based cluster assignment', color: '#60A5FA', badge: 'Distance-Based' },
    { key: 'RandomForest', title: 'Random Forest', subtitle: '100 decision trees — Tree-based nonlinear rule learning', color: '#4ADE80', badge: 'Tree-Based' },
    { key: 'SVM', title: 'SVM', subtitle: 'Support Vector Machine (RBF) — Margin-based hyperplane separation', color: '#FB923C', badge: 'Margin-Based' },
    { key: 'LogisticRegression', title: 'Logistic Regression', subtitle: 'Logistic Regression — Probability-based linear classification', color: '#A78BFA', badge: 'Probability-Based' },
    { key: 'Ensemble', title: 'Ensemble (KNN + RF + SVM + LR)', subtitle: 'Hard voting — Majority vote from all four models', color: '#34D399', badge: 'Hard Voting' },
  ];

  return (
    <div className="flex flex-col p-6 min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="max-w-6xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-white mb-2">Audio Feature Clusters</h1>
        <p className="text-gray-400 mb-6">2D PCA Projection — Best Scaler: {scaler}</p>
        
        {/* Per-model decision boundary charts */}
        {model_boundaries ? (
          <>
            {modelConfigs.map(({ key, title, subtitle, color, badge }) => {
              const boundary = model_boundaries[key];
              const mMetrics = per_model_metrics ? per_model_metrics[key] : null;
              if (!boundary) return null;
              return (
                <ModelChart
                  key={key}
                  title={title}
                  subtitle={subtitle}
                  boundary={boundary}
                  accentColor={color}
                  modelMetrics={mMetrics}
                  badgeText={badge}
                  isBest={bestModel === key}
                />
              );
            })}
          </>
        ) : (
          /* Fallback: single chart with default decision_boundary (backward compat) */
          <ModelChart
            title="Ensemble"
            subtitle="Decision boundary from ensemble classifier"
            boundary={decision_boundary}
            accentColor="#34D399"
            modelMetrics={null}
            badgeText="Default"
          />
        )}



        {/* Comparative Performance Table */}
        {per_model_metrics && Object.keys(per_model_metrics).length > 0 && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Model Comparison</h3>
            <p className="text-gray-400 text-sm mb-5">
              All models cross-validated and evaluated on a 70/30 test split. The model with the highest validation score is selected.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="pb-3 text-gray-400 font-medium">Model</th>
                    <th className="pb-3 text-gray-400 font-medium text-center">Train Score</th>
                    <th className="pb-3 text-gray-400 font-medium text-center">Val Score</th>
                    <th className="pb-3 text-gray-400 font-medium text-center">Test Acc</th>
                    <th className="pb-3 text-gray-400 font-medium text-center">Precision</th>
                    <th className="pb-3 text-gray-400 font-medium text-center">Recall</th>
                    <th className="pb-3 text-gray-400 font-medium text-center">F1 Score</th>
                    <th className="pb-3 text-gray-400 font-medium text-center">Performance</th>
                  </tr>
                </thead>
                <tbody>
                  {modelConfigs.map(({ key, title, color }) => {
                    const m = per_model_metrics[key];
                    if (!m) return null;
                    const isBest = bestModel === key;
                    const valPct = ((m.val_score || 0) * 100).toFixed(1);
                    return (
                      <tr key={key} className={isBest ? 'bg-yellow-500/10 border-t-2 border-yellow-500/30' : 'border-b border-gray-700/50'}>
                        <td className="py-3 pl-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
                            <span className={isBest ? 'text-yellow-300 font-bold' : 'text-white font-semibold'}>{title}</span>
                            {isBest && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full border border-yellow-500/30">★ Selected</span>}
                          </div>
                        </td>
                        <td className={`py-3 text-center ${isBest ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}>{m.train_score !== undefined ? m.train_score : 'N/A'}</td>
                        <td className={`py-3 text-center ${isBest ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}>{m.val_score !== undefined ? m.val_score : 'N/A'}</td>
                        <td className={`py-3 text-center ${isBest ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}>{m.test_acc !== undefined ? m.test_acc : 'N/A'}</td>
                        <td className={`py-3 text-center ${isBest ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}>{m.precision !== undefined ? m.precision : 'N/A'}</td>
                        <td className={`py-3 text-center ${isBest ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}>{m.recall !== undefined ? m.recall : 'N/A'}</td>
                        <td className={`py-3 text-center ${isBest ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}>{m.f1_score !== undefined ? m.f1_score : 'N/A'}</td>
                        <td className="py-3 px-2">
                          <div className="w-full bg-gray-600/50 rounded-full h-2.5">
                            <div className="h-2.5 rounded-full" style={{ width: `${valPct}%`, backgroundColor: color }}></div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MLVisualization;
