//2000 to 2025

// Create a function to calculate the NDWI

var NDWI = function(img){
  var bands = img.select(['sur_refl_b01','sur_refl_b02']).multiply(0.0001)
  var ndwi = bands.normalizedDifference(['sur_refl_b01','sur_refl_b02']).rename('NDWI')
  
  return ndwi
}
var modis_2001 = ee.ImageCollection("MODIS/061/MOD09GQ")
            .filterDate('2001-01-01','2001-12-31')
            .map(NDWI)
            .median()
            .gt(0.1)
Map.addLayer(modis_2001.clip(geometry), {}, 'Modis water 2001')

var modis_2024 = ee.ImageCollection("MODIS/061/MOD09GQ")
                 .filterDate('2024-01-01','2024-12-31')
                 .map(NDWI)
                 .median()
                 .gt(0.1)
Map.addLayer(modis_2024.clip(geometry), {}, 'Modis water 2024') 

var chnage = modis_2001.subtract(modis_2024)

Map.addLayer(chnage.clip(geometry), {}, 'Coastline change')

var mask = chnage.updateMask(chnage)

Map.addLayer(mask.clip(geometry), {} , 'change mask')

var area_land = mask.reduceToVectors({
  geometry:geometry,
  scale:250
}).union(1)

Map.addLayer(area_land)
