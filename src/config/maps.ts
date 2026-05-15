export const DEFAULT_CENTER = { lat: -15.5595, lng: -54.3079 }; // Primavera do Leste, MT center
export const DEFAULT_ZOOM = 14;

// Add Google Maps API Key provided by user
export const GOOGLE_MAPS_API_KEY = "AQ.Ab8RN6LJv8cYpXjZL8fEqDL9l_vgDqg42x_W51MAG5SPxgZt4w";

export const MAP_LAYERS = {
  streets: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
  },
  google: {
    url: `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}`,
    attribution: "&copy; Google Maps",
  },
  googleHybrid: {
    url: `https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}`,
    attribution: "&copy; Google Maps",
  }
};
