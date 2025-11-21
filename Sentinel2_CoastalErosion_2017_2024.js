// ==============================================================
// PROJECT: COASTAL EROSION MONITORING (SENTINEL-2)
// LOCATION: VASCO DA GAMA PENINSULA
// ==============================================================

// 1. SETUP AND CONFIGURATION
// --------------------------------------------------------------
Map.centerObject(geometry, 13);
Map.setOptions('SATELLITE'); // Background map

// Function to mask clouds using the Sentinel-2 QA band
function maskS2clouds(image) {
  var qa = image.select('QA60');
  // Bits 10 and 11 are clouds and cirrus
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  // Both flags should be zero
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000);
}

// Function to add MNDWI (Modified Normalized Difference Water Index)
// MNDWI = (Green - SWIR) / (Green + SWIR)
// Better than NDWI because it ignores white-caps and urban reflection
function addMNDWI(image) {
  var mndwi = image.normalizedDifference(['B3', 'B11']).rename('MNDWI');
  return image.addBands(mndwi);
}

// 2. LOAD DATASETS (Comparing 2017 to 2024)
// --------------------------------------------------------------
// We use the "Dry Season" (Jan-April) to minimize clouds and seasonal flooding

// --- YEAR 2017 (BASELINE) ---
var col_2017 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geometry)
    .filterDate('2001-01-01', '2017-04-30')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .map(maskS2clouds)
    .map(addMNDWI);

var mndwi_2017 = col_2017.select('MNDWI').median();
var water_2017 = mndwi_2017.gt(0); // Threshold: >0 is Water, <0 is Land

// --- YEAR 2024 (CURRENT) ---
var col_2024 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geometry)
    .filterDate('2024-01-01', '2024-04-30')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .map(maskS2clouds)
    .map(addMNDWI);

var mndwi_2024 = col_2024.select('MNDWI').median();
var water_2024 = mndwi_2024.gt(0);

// 3. CALCULATE RAW CHANGES
// --------------------------------------------------------------
// Erosion: Was Land (0) in 2017 -> Is Water (1) in 2024
var erosion_raw = water_2017.not().and(water_2024);

// Accretion: Was Water (1) in 2017 -> Is Land (0) in 2024
var accretion_raw = water_2017.and(water_2024.not());


// 4. CLEANING & FILTERING (THE FIX)
// --------------------------------------------------------------

// A. COASTAL BUFFER FILTER
// We create a mask that is only TRUE near the permanent water body.
// This removes the inland rice paddies and lakes from the result.
// Step 1: Define permanent water (water present in both years)
var permanent_water = water_2017.and(water_2024);
// Step 2: Calculate distance from permanent water
var distance = permanent_water.fastDistanceTransform(30).multiply(10); // ~meters
// Step 3: Create a mask (e.g., keep changes within 500m of water)
var coastal_mask = distance.lt(500).and(distance.gt(0)); 

// B. NOISE FILTER (DESPECKLE)
// Remove tiny isolated pixels (noise). We only keep clusters of > 8 pixels.
function removeNoise(image) {
  var count = image.connectedPixelCount(15, true);
  return image.updateMask(count.gte(8));
}

// Apply filters
var erosion_clean = removeNoise(erosion_raw.updateMask(coastal_mask));
var accretion_clean = removeNoise(accretion_raw.updateMask(coastal_mask));


// 5. VISUALIZATION
// --------------------------------------------------------------

// Show the base satellite image (2024) for context
Map.addLayer(col_2024.median(), {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 'True Color 2024');

// Show the Water Layers (Optional - for debugging)
// Map.addLayer(water_2017.selfMask(), {palette: 'blue'}, 'Water 2017', false);
// Map.addLayer(water_2024.selfMask(), {palette: 'cyan'}, 'Water 2024', false);

// SHOW THE RESULTS
Map.addLayer(erosion_clean.selfMask().clip(geometry), {palette: ['ff0000']}, 'DETECTED EROSION (Red)');
Map.addLayer(accretion_clean.selfMask().clip(geometry), {palette: ['00ff00']}, 'DETECTED ACCRETION (Green)');


// 6. CALCULATE STATISTICS
// --------------------------------------------------------------
// Calculate the total eroded area in square meters
var erosion_area = erosion_clean.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: 10,
  maxPixels: 1e10
});

print('Total Eroded Area (sq meters):', erosion_area.get('MNDWI'));

var accretion_area = accretion_clean.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: 10,
  maxPixels: 1e10
});

print('Total Accretion Area (sq meters):', accretion_area.get('MNDWI'));
