
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';


const firebaseConfig = {
  "projectId": "seatassignai-bccvh",
  "appId": "1:810685611284:web:c4ef6119054b0c389f5601",
  "storageBucket": "seatassignai-bccvh.firebasestorage.app",
  "apiKey": "AIzaSyA45Y_geSqcPCxy_12zrfwI7AF6IqdJgcE",
  "authDomain": "seatassignai-bccvh.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "810685611284"
};

let app: FirebaseApp;

if (typeof window !== 'undefined') {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}
