# I-DEWS (Integrated Disaster Early Warning System)

I-DEWS is a real-time mobile admin application designed to monitor seismic activities and provide critical disaster alerts with low-latency precision.

## 🚀 Key Features
- **Live Telemetry:** Real-time seismic data streaming via WebSockets.
- **Anomaly Detection:** Implements STA/LTA algorithm for real-time geophysical anomaly detection.
- **Emergency Override (CAO):** Critical Alert Override capability to force broadcast notifications across mobile clients, bypassing silent modes.
- **Protocol Compliant:** Supports CAP v1.2 (Common Alerting Protocol) for standardized emergency messaging.

## 🛠️ Tech Stack
- **Mobile:** React Native, Expo, TypeScript
- **Backend:** Node.js, WebSocket (`ws`)

## 📋 How to Run
1. **Gateway Server:** 
   `node server.js`
2. **Mobile App:** 
   `npm install`
   `npx expo start`

## ⚖️ License
This project is licensed under the MIT License. Feel free to use, modify, and distribute for disaster research and humanitarian purposes.