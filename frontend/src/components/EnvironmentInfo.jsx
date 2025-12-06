// src/components/EnvironmentInfo.jsx
// Debug component to show current environment configuration

import React from 'react';
import envConfig from '../config/environment.js';
import { getServiceUrl, PORTS } from '../redux/services/api.js';

const EnvironmentInfo = () => {
  const config = envConfig.getConfig();
  
  return (
    <div style={{ 
      padding: '20px', 
      margin: '20px', 
      border: '2px solid #ccc', 
      borderRadius: '8px',
      backgroundColor: '#f5f5f5',
      fontFamily: 'monospace',
      fontSize: '12px'
    }}>
      <h3>🔧 Environment Configuration Debug</h3>
      
      <div style={{ marginBottom: '15px' }}>
        <strong>Environment:</strong> {config.environment}<br/>
        <strong>Is Codespaces:</strong> {config.isCodespaces ? 'Yes' : 'No'}<br/>
        <strong>Is Localhost:</strong> {config.isLocalhost ? 'Yes' : 'No'}<br/>
        {config.codespaceName && <><strong>Codespace Name:</strong> {config.codespaceName}<br/></>}
      </div>

      <div style={{ marginBottom: '15px' }}>
        <strong>🎵 AI Service (YouTube API):</strong><br/>
        <a href={config.apiBaseUrl} target="_blank" rel="noopener noreferrer">
          {config.apiBaseUrl}
        </a>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <strong>🔗 Backend Services:</strong><br/>
        {Object.entries(PORTS).map(([service, port]) => (
          <div key={service} style={{ marginLeft: '10px' }}>
            <strong>{service}:</strong> 
            <a href={getServiceUrl(service)} target="_blank" rel="noopener noreferrer">
              {getServiceUrl(service)}
            </a>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '15px' }}>
        <strong>🎬 YouTube Channel:</strong> {config.youtubeChannelId}
      </div>

      <div style={{ fontSize: '10px', color: '#666' }}>
        <strong>Browser Info:</strong><br/>
        Hostname: {window.location.hostname}<br/>
        Port: {window.location.port}<br/>
        Protocol: {window.location.protocol}<br/>
        
        <br/>
        <strong>Environment Variables:</strong><br/>
        VITE_API_BASE_URL: {import.meta.env.VITE_API_BASE_URL || 'undefined'}<br/>
        VITE_BACKEND_API_URL: {import.meta.env.VITE_BACKEND_API_URL || 'undefined'}<br/>
        VITE_ENVIRONMENT: {import.meta.env.VITE_ENVIRONMENT || 'undefined'}<br/>
        
        {window.ENV_CONFIG && (
          <>
            <br/>
            <strong>Runtime Config:</strong><br/>
            {JSON.stringify(window.ENV_CONFIG, null, 2)}
          </>
        )}
      </div>
    </div>
  );
};

export default EnvironmentInfo;
