(function() {
    'use strict';
    
    const api = window.SubwayBuilderAPI;
    
    if (!api) {
        console.error('[Railway Overlay] SubwayBuilderAPI not found!');
        return;
    }
    
    if (typeof window.RailwayData === 'undefined') {
        window.RailwayData = {};
    }
    
    console.log('[Railway Overlay] Starting initialization...');
    
    let currentCity = null;
    let overlayEnabled = true;
    let showLabels = true;
    let isLoading = false;
    let hasDownloadedForCity = new Set();
    
    const RAILWAY_STYLES = {
        rail: {
            surface: { color: '#5e5e5e', width: 3, zOffset: 0 },
            tunnel: { color: '#7e7e7e', width: 2, zOffset: -1, dasharray: [4, 2] },
            bridge: { color: '#5e5e5e', width: 3, zOffset: 1 }
        },
        rail_yard: {
            surface: { color: '#919191', width: 2, zOffset: 0 },
            tunnel: { color: '#919191', width: 1.5, zOffset: -1, dasharray: [4, 2] },
            bridge: { color: '#919191', width: 2, zOffset: 1 }
        },
        subway: {
            surface: { color: '#0000cc', width: 3.5, zOffset: 0 },
            tunnel: { color: '#0000cc', width: 3.5, zOffset: -1, dasharray: [3, 2] },
            bridge: { color: '#0000cc', width: 3.5, zOffset: 1 }
        },
        light_rail: {
            surface: { color: '#0033ff', width: 3, zOffset: 0 },
            tunnel: { color: '#0033ff', width: 3, zOffset: -1, dasharray: [3, 2] },
            bridge: { color: '#0033ff', width: 3, zOffset: 1 }
        },
        tram: {
            surface: { color: '#ff00ff', width: 2.5, zOffset: 0 },
            tunnel: { color: '#ff00ff', width: 2, zOffset: -1, dasharray: [3, 2] },
            bridge: { color: '#ff00ff', width: 2.5, zOffset: 1 }
        },
        narrow_gauge: {
            surface: { color: '#ff00ff', width: 2, zOffset: 0 },
            tunnel: { color: '#ff00ff', width: 1.5, zOffset: -1, dasharray: [3, 2] },
            bridge: { color: '#ff00ff', width: 2, zOffset: 1 }
        },
        construction: {
            surface: { color: '#f20000', width: 3, zOffset: 0, dasharray: [6, 3] },
            tunnel: { color: '#f20000', width: 2.5, zOffset: -1, dasharray: [4, 2] },
            bridge: { color: '#f20000', width: 3, zOffset: 1, dasharray: [6, 3] }
        },
        proposed: {
            surface: { color: '#ffb300', width: 2.5, zOffset: 0, dasharray: [8, 4] },
            tunnel: { color: '#ffb300', width: 2, zOffset: -1, dasharray: [4, 2] },
            bridge: { color: '#ffb300', width: 2.5, zOffset: 1, dasharray: [8, 4] }
        },
        abandoned: {
            surface: { color: '#800000', width: 2, zOffset: 0, dasharray: [2, 3] },
            tunnel: { color: '#00abab', width: 1.5, zOffset: -1, dasharray: [2, 3] },
            bridge: { color: '#00abab', width: 2, zOffset: 1, dasharray: [2, 3] }
        },
        platform: {
            surface: { color: '#0073ff', width: 2, zOffset: 0 },
            tunnel: { color: '#0073ff', width: 2, zOffset: -1 },
            bridge: { color: '#0073ff', width: 2, zOffset: 1 }
        }
    };
    
    const DB_NAME = 'RailwayOverlayDB';
    const STORE_NAME = 'cities';
    const DB_VERSION = 1;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (event) => reject('IndexedDB error: ' + event.target.error);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }

    async function dbGet(key) {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('[Railway Overlay] DB Get Error:', e);
            return null;
        }
    }

    async function dbSet(key, value) {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(value, key);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('[Railway Overlay] DB Set Error:', e);
            return false;
        }
    }

    async function loadFromCache(cityCode) {
        try {
            const cachedData = await dbGet(`railway_data_${cityCode}`);
            if (cachedData) {
                window.RailwayData[cityCode] = cachedData;
                return cachedData;
            }
        } catch (e) {
             api.ui.showNotification(`Cache Check Failed: ${e.message}`, 'error');
        }
        return null;
    }

    async function saveToCache(cityCode, data) {
        try {
            const success = await dbSet(`railway_data_${cityCode}`, data);
            return success;
        } catch (e) {
            api.ui.showNotification(`Failed to save to IDB: ${e.message}`, 'error');
            return false;
        }
    }

    async function fetchRailwayData(cityCode, forceRefresh = false) {
        try {
            const cities = api.utils.getCities();
            const cityData = cities.find(c => c.code === cityCode);
            
            if (!cityData) {
                return null;
            }
            
            const cityName = cityData.name;
            let osmData = null;
        
            if (!forceRefresh && window.RailwayData[cityCode]) {
                osmData = window.RailwayData[cityCode];
            } 
            else if (!forceRefresh) {
                const cached = await loadFromCache(cityCode);
                if (cached) {
                    api.ui.showNotification(`Loaded cached data for ${cityName}`, 'success');
                    window.RailwayData[cityCode] = cached; 
                    osmData = cached;
                }
            }

            if (osmData) {
                if (osmData.type === 'FeatureCollection') {
                    return processGeoJSON(osmData, cityName);
                }
                
                if (osmData.elements && Array.isArray(osmData.elements)) {
                    return await processOSMDataV6(osmData, cityName);
                }
                
                return null;
            } else {
                api.ui.showNotification(`No data found for ${cityName}. Please use the bottom panel to import.`, 'info');
                return null;
            }
            
            return null;
        } catch (error) {
            api.ui.showNotification(`DEBUG ERROR: ${error.message}`, 'error');
            return null;
        }
    }
    
    async function downloadFromOSM(cityCode, cityName, cityData) {
        return null;
    }
    
    function processGeoJSON(geoJSON, cityName) {
        const layerData = {};
        const stations = [];
        const railwayTypes = ['rail', 'subway', 'light_rail', 'tram', 'narrow_gauge', 'construction', 'proposed', 'abandoned', 'platform'];
        const contexts = ['surface', 'tunnel', 'bridge'];
        
        railwayTypes.forEach(type => {
            contexts.forEach(context => {
                layerData[`${type}_${context}`] = [];
            });
        });

        geoJSON.features.forEach(feature => {
            const props = feature.properties || {};
            const geometry = feature.geometry;
            if (!geometry) return;

            if (geometry.type === 'Point' && (
                (props.railway && ['station', 'halt', 'stop', 'subway_entrance', 'tram_stop'].includes(props.railway)) ||
                (props.public_transport === 'stop_position')
            )) {
                stations.push(feature);
                return;
            }

            if (geometry.type === 'LineString' || geometry.type === 'MultiLineString' || geometry.type === 'Polygon') {
                let railway = props.railway;
                if (!railway && props.public_transport === 'platform') {
                    railway = 'platform';
                }
                if (!railway) return;

                const isAbandoned = ['abandoned', 'disused', 'razed', 'dismantled'].includes(railway);
                const railType = isAbandoned ? 'abandoned' : railway;
                
                const tunnel = props.tunnel === 'yes' || props.tunnel === true || (props.layer && parseInt(props.layer) < 0);
                const bridge = props.bridge === 'yes' || props.bridge === true || (props.layer && parseInt(props.layer) > 0);
                const isYard = props.service === 'yard' || props.service === 'siding';
                
                let context = 'surface';
                if (tunnel) context = 'tunnel';
                else if (bridge) context = 'bridge';
                
                const finalType = (railType === 'rail' && isYard) ? 'rail_yard' : railType;
                const key = `${finalType}_${context}`;

                if (layerData[key]) {
                    layerData[key].push(feature);
                }
            }
        });

        return { layerData, stations };
    }

    async function processOSMDataV6(osmData, cityName) {
        const layerData = {};
        const stations = [];
        
        const railwayTypes = ['rail', 'subway', 'light_rail', 'tram', 'narrow_gauge', 'construction', 'proposed', 'abandoned', 'platform'];
        const contexts = ['surface', 'tunnel', 'bridge'];
        
        railwayTypes.forEach(type => {
            contexts.forEach(context => {
                layerData[`${type}_${context}`] = [];
            });
        });
        
        const nodes = new Map();
        let nodeCount = 0;
        let wayCount = 0;
        let railwayWayCount = 0;
        
        const chunkSize = 5000;
        const totalElements = osmData.elements.length;
        
        for (let i = 0; i < totalElements; i += chunkSize) {
            const end = Math.min(i + chunkSize, totalElements);
            
            for (let j = i; j < end; j++) {
                const el = osmData.elements[j];
                if (el.type === 'node') {
                    nodes.set(el.id, { lat: el.lat, lon: el.lon, tags: el.tags || {} });
                    nodeCount++;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        
        for (let i = 0; i < totalElements; i += chunkSize) {
            const end = Math.min(i + chunkSize, totalElements);
            
            for (let j = i; j < end; j++) {
                const element = osmData.elements[j];
                
                if (element.type === 'way' && element.nodes && element.nodes.length > 0) {
                    wayCount++;
                    let railway = element.tags?.railway;
                    if (!railway && element.tags?.public_transport === 'platform') {
                        railway = 'platform';
                    }
                    if (!railway) continue; 
                    
                    railwayWayCount++;
                    
                    const coords = [];
                    for (const nodeId of element.nodes) {
                        const node = nodes.get(nodeId);
                        if (node) {
                            coords.push([node.lon, node.lat]);
                        }
                    }
                    
                    if (coords.length < 2) continue;
                    
                    const isAbandoned = ['abandoned', 'disused', 'razed', 'dismantled'].includes(railway);
                    const railType = isAbandoned ? 'abandoned' : railway;
                    
                    const tunnel = element.tags?.tunnel === 'yes' || (element.tags?.layer && parseInt(element.tags.layer) < 0);
                    const bridge = element.tags?.bridge === 'yes' || element.tags?.bridge === 'viaduct' || (element.tags?.layer && parseInt(element.tags.layer) > 0);
                    const isYard = element.tags?.service === 'yard' || element.tags?.service === 'siding';
                    
                    let context = 'surface';
                    if (tunnel) context = 'tunnel';
                    else if (bridge) context = 'bridge';
                    
                    const finalType = (railType === 'rail' && isYard) ? 'rail_yard' : railType;
                    const key = `${finalType}_${context}`;
                    
                    if (layerData[key]) {
                        layerData[key].push({
                            type: 'Feature',
                            properties: {
                                railway: finalType,
                                context: context,
                                name: element.tags?.name || '',
                                ref: element.tags?.ref || '',
                                operator: element.tags?.operator || ''
                            },
                            geometry: {
                                type: 'LineString',
                                coordinates: coords
                            }
                        });
                    }
                }
            }
            if (i % (chunkSize * 2) === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        
        nodes.forEach((node, id) => {
            if (node.tags.railway && ['station', 'halt', 'stop', 'subway_entrance', 'tram_stop'].includes(node.tags.railway)) {
                const lineInfo = node.tags.line || 
                                node.tags.lines || 
                                node.tags['subway:line'] || 
                                node.tags['train:line'] || 
                                node.tags['tram:line'] || 
                                node.tags.ref ||
                                '';
                
                stations.push({
                    type: 'Feature',
                    properties: {
                        name: node.tags.name || 'Station',
                        railway: node.tags.railway,
                        network: node.tags.network || '',
                        operator: node.tags.operator || '',
                        line: lineInfo,
                        ref: node.tags.ref || '',
                        platforms: node.tags.platforms || node.tags['public_transport:platforms'] || ''
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [node.lon, node.lat]
                    }
                });
            }
        });
        
        let featureCounts = {};
        Object.entries(layerData).forEach(([key, features]) => {
            if (features.length > 0) {
                featureCounts[key] = features.length;
            }
        });
        
        return { layerData, stations };
    }
    
    async function loadRailwayOverlay(cityCode, forceRefresh = false) {
        if (isLoading) {
            return;
        }
        
        isLoading = true;
        currentCity = cityCode;
        
        const map = api.utils.getMap();
        if (!map) {
            isLoading = false;
            return;
        }
        
        const data = await fetchRailwayData(cityCode, forceRefresh);
        
        if (!data) {
            isLoading = false;
            return;
        }
        
        const { layerData, stations } = data;
        
        removeExistingLayers(cityCode);
        
        const layers = map.getStyle().layers;
        let insertBeforeId = null;
        
        for (const layer of layers) {
            if (layer.type === 'symbol' || layer.id.includes('label') || layer.id.includes('text')) {
                insertBeforeId = layer.id;
                break;
            }
        }
        
        let totalFeatures = 0;
        
        const orderedTypes = ['rail', 'rail_yard', 'narrow_gauge', 'subway', 'light_rail', 'tram', 'construction', 'proposed', 'abandoned', 'platform'];
        const orderedContexts = ['tunnel', 'surface', 'bridge'];
        
        orderedTypes.forEach(railType => {
            orderedContexts.forEach(context => {
                const key = `${railType}_${context}`;
                const features = layerData[key];
                
                if (!features || features.length === 0) return;
                
                const style = RAILWAY_STYLES[railType]?.[context];
                if (!style) return;
                
                totalFeatures += features.length;
                
                try {
                    const sourceId = `railway-${cityCode}-${key}`;
                    const layerId = `railway-layer-${cityCode}-${key}`;
                    
                    if (map.getSource(sourceId)) return;
                    
                    map.addSource(sourceId, {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: features }
                    });
                    
                    if (map.getLayer(layerId)) return;
                    
                    map.addLayer({
                        id: layerId,
                        type: 'line',
                        source: sourceId,
                        paint: {
                            'line-color': style.color,
                            'line-width': style.width,
                            'line-opacity': overlayEnabled ? (style.opacity || 1.0) : 0,
                            ...(style.dasharray && { 'line-dasharray': style.dasharray })
                        },
                        layout: {
                            'visibility': 'visible',
                            'line-cap': 'round',
                            'line-join': 'round'
                        }
                    });
                } catch (e) {
                    console.error(`[Railway Overlay] Failed to create layer ${key}:`, e);
                }
            });
        });
        
        if (stations.length > 0) {
            try {
                const stationSourceId = `railway-stations-${cityCode}`;
                const labelLayerId = `railway-station-labels-${cityCode}`;
                
                if (!map.getSource(stationSourceId)) {
                    map.addSource(stationSourceId, {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: stations }
                    });
                }
                
                if (!map.getLayer(labelLayerId)) {
                    map.addLayer({
                        id: labelLayerId,
                        type: 'symbol',
                        source: stationSourceId,
                        layout: {
                            'text-field': ['get', 'name'],
                            'text-size': 11,
                            'text-offset': [0, 0],
                            'text-anchor': 'left',
                            'text-padding': 2,
                            'visibility': showLabels ? 'visible' : 'none',
                            'text-optional': true
                        },
                        paint: {
                            'text-color': '#000000',
                            'text-halo-color': '#FFFFFF',
                            'text-halo-width': 2,
                            'text-halo-blur': 0.5
                        },
                        minzoom: 12
                    }, insertBeforeId);
                }
                
                const dotsLayerId = `railway-station-dots-${cityCode}`;
                if (!map.getLayer(dotsLayerId)) {
                    map.addLayer({
                        id: dotsLayerId,
                        type: 'circle',
                        source: stationSourceId,
                        paint: {
                            'circle-radius': 4,
                            'circle-color': '#FFFFFF',
                            'circle-stroke-width': 2,
                            'circle-stroke-color': '#000000',
                            'circle-opacity': 0
                        },
                        layout: { 'visibility': 'visible' },
                        minzoom: 12
                    }, labelLayerId);
                }
            } catch (e) {
                console.error('[Railway Overlay] Failed to create station layers:', e);
            }
        }
        
        isLoading = false;
    }
    
    function removeExistingLayers(cityCode) {
        const map = api.utils.getMap();
        if (!map) return;
        
        const style = map.getStyle();
        if (!style) return;
        
        const layersToRemove = [];
        style.layers.forEach(layer => {
            if (layer.id.includes(`railway-`) && layer.id.includes(`-${cityCode}-`)) {
                layersToRemove.push(layer.id);
            }
        });
        
        layersToRemove.forEach(layerId => {
            try {
                map.removeLayer(layerId);
            } catch (e) {}
        });
        
        const sourcesToRemove = [];
        Object.keys(style.sources).forEach(sourceId => {
            if (sourceId.includes(`railway-`) && sourceId.includes(`-${cityCode}-`)) {
                sourcesToRemove.push(sourceId);
            }
        });
        
        sourcesToRemove.forEach(sourceId => {
            try {
                map.removeSource(sourceId);
            } catch (e) {}
        });
    }
    
    function toggleOverlay(enabled) {
        overlayEnabled = enabled;
        if (!currentCity) return;
        const map = api.utils.getMap();
        if (!map) return;
        
        map.getStyle().layers.forEach(layer => {
            if (layer.id.includes(`railway-layer-`)) {
                try {
                    const isPlatform = layer.id.includes('platform');
                    
                    if (isPlatform) {
                        map.setPaintProperty(layer.id, 'line-opacity', (enabled && showLabels) ? 1.0 : 0);
                    } else {
                        map.setPaintProperty(layer.id, 'line-opacity', enabled ? 1.0 : 0);
                    }
                } catch (e) {}
            }
            if (layer.id.includes(`railway-station-dots-`)) {
                try {
                    map.setPaintProperty(layer.id, 'circle-opacity', 0);
                } catch (e) {}
            }
        });
        
        if (!enabled) {
            map.getStyle().layers.forEach(layer => {
                if (layer.id.includes(`railway-station-labels-`)) {
                    try {
                        map.setLayoutProperty(layer.id, 'visibility', 'none');
                    } catch (e) {}
                }
            });
        } else if (showLabels) {
            map.getStyle().layers.forEach(layer => {
                if (layer.id.includes(`railway-station-labels-`)) {
                    try {
                        map.setLayoutProperty(layer.id, 'visibility', 'visible');
                    } catch (e) {}
                }
            });
        }
    }
    
    function toggleLabels(enabled) {
        showLabels = enabled;
        if (!currentCity) return;
        const map = api.utils.getMap();
        if (!map) return;
        
        if (!overlayEnabled) return;
        
        map.getStyle().layers.forEach(layer => {
            if (layer.id.includes(`railway-station-labels-`)) {
                try {
                    map.setLayoutProperty(layer.id, 'visibility', enabled ? 'visible' : 'none');
                } catch (e) {}
            }
            if (layer.id.includes(`railway-layer-`) && layer.id.includes(`platform`)) {
                try {
                    map.setPaintProperty(layer.id, 'line-opacity', enabled ? 1.0 : 0);
                } catch (e) {}
            }
        });
    }
    
    const { React, components, icons } = api.utils;
    const h = React.createElement;
    const { Train, Tag, Download, Loader2, Upload, FileText, Info } = icons;
    
    const RailwayPanel = () => {
        const [enabled, setEnabled] = React.useState(overlayEnabled);
        const [labels, setLabels] = React.useState(showLabels);
        const [hasData, setHasData] = React.useState(false);
        const [isOpen, setIsOpen] = React.useState(false);
        const [showPaste, setShowPaste] = React.useState(false);
        const [showTutorial, setShowTutorial] = React.useState(false);
        const [showLegend, setShowLegend] = React.useState(false);
        const [pasteContent, setPasteContent] = React.useState('');
        const [copySuccess, setCopySuccess] = React.useState(false);
        const buttonRef = React.useRef(null);
        const fileInputRef = React.useRef(null);
        
        React.useEffect(() => {
            const checkData = () => {
                if (!currentCity) {
                    setHasData(false);
                    return;
                }
                setHasData(!!window.RailwayData[currentCity]);
            };
            
            checkData();
            const interval = setInterval(checkData, 2000);
            return () => clearInterval(interval);
        }, [currentCity]);
        
        React.useEffect(() => {
            if (!isOpen) return;
            
            const handleClickOutside = (e) => {
                const panel = document.querySelector('.railway-overlay-panel');
                const button = buttonRef.current;
                if (panel && !panel.contains(e.target) && button && !button.contains(e.target)) {
                    setIsOpen(false);
                }
            };
            
            setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutside);
            }, 100);
            
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, [isOpen]);
        
        const handleToggleLines = (checked) => {
            setEnabled(checked);
            toggleOverlay(checked);
        };
        
        const handleToggleLabels = (checked) => {
            setLabels(checked);
            toggleLabels(checked);
        };

        const handleFileUpload = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target.result);
                    processImportedData(json);
                } catch (err) {
                    api.ui.showNotification('Failed to parse JSON file', 'error');
                }
                e.target.value = null;
            };
            reader.readAsText(file);
        };

        const handlePasteImport = () => {
            try {
                const json = JSON.parse(pasteContent);
                processImportedData(json);
                setShowPaste(false);
                setPasteContent('');
            } catch (err) {
                api.ui.showNotification('Failed to parse pasted JSON', 'error');
            }
        };

        const processImportedData = async (json) => {
            if (!currentCity) {
                api.ui.showNotification('No city loaded', 'error');
                return;
            }

            if (!json.elements && !json.version && json.type !== 'FeatureCollection') {
                 api.ui.showNotification('Invalid OSM/GeoJSON data format', 'error');
                 return;
            }

            api.ui.showNotification('Saving data to cache...', 'info');
            const saved = await saveToCache(currentCity, json); 
            if (saved) {
                const check = await loadFromCache(currentCity);
                if (check) {
                     api.ui.showNotification('Data cached & verified successfully', 'success');
                } else {
                     api.ui.showNotification('Warning: Cache write succeeded but read failed?', 'warning');
                }
            } else {
                api.ui.showNotification('Warning: Could not save to cache (file too big?)', 'warning');
            }

            window.RailwayData[currentCity] = json;
            setHasData(true);
            api.ui.showNotification('Data imported successfully', 'success');
            await loadRailwayOverlay(currentCity, false);
        };

        const copyQuery = () => {
            const query = `[out:json][timeout:25][bbox:{{bbox}}];
(
  way[railway];
  way[public_transport=platform][train=yes];
  way[public_transport=platform][subway=yes];
  way[public_transport=platform][light_rail=yes];
  way[public_transport=platform][tram=yes];
  node[railway=station];
);
out body;
>;
out skel qt;`;
            navigator.clipboard.writeText(query);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        };

        const renderLegend = () => [
            h('div', { 
                key: 'header',
                className: 'flex items-center gap-2 pb-2',
                style: { borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }
            }, [
                h('span', { className: 'font-semibold text-sm' }, 'Legend'),
            ]),
            h('div', { className: 'text-xs space-y-3 max-h-[300px] overflow-y-auto mt-2 pr-2' }, [
                h('div', { className: 'flex items-center gap-3' }, [
                    h('div', { style: { width: '32px', height: '8px', backgroundColor: '#0000cc', borderRadius: '2px' } }),
                    h('span', { className: 'opacity-90' }, 'Subway')
                ]),
                h('div', { className: 'flex items-center gap-3' }, [
                    h('div', { style: { width: '32px', height: '8px', backgroundColor: '#0033ff', borderRadius: '2px' } }),
                    h('span', { className: 'opacity-90' }, 'Light Rail')
                ]),
                h('div', { className: 'flex items-center gap-3' }, [
                    h('div', { style: { width: '32px', height: '8px', backgroundColor: '#5e5e5e', borderRadius: '2px' } }),
                    h('span', { className: 'opacity-90' }, 'Heavy Rail')
                ]),
                h('div', { className: 'flex items-center gap-3' }, [
                    h('div', { style: { width: '32px', height: '8px', backgroundColor: '#ff00ff', borderRadius: '2px' } }),
                    h('span', { className: 'opacity-90' }, 'Tram / Narrow Gauge')
                ]),
                h('div', { className: 'flex items-center gap-3' }, [
                    h('div', { style: { width: '32px', height: '8px', backgroundColor: '#919191', borderRadius: '2px' } }),
                    h('span', { className: 'opacity-90' }, 'Rail Yard')
                ]),
                h('div', { className: 'flex items-center gap-3' }, [
                    h('div', { style: { width: '32px', height: '8px', backgroundColor: '#0073ff', borderRadius: '2px' } }),
                    h('span', { className: 'opacity-90' }, 'Platform')
                ]),
                h('div', { className: 'flex items-center gap-3' }, [
                    h('div', { style: { width: '32px', height: '8px', border: '2px dashed #f20000', borderRadius: '2px' } }),
                    h('span', { className: 'opacity-90' }, 'Construction')
                ]),
                h('div', { className: 'flex items-center gap-3' }, [
                    h('div', { style: { width: '32px', height: '8px', border: '2px dashed #ffb300', borderRadius: '2px' } }),
                    h('span', { className: 'opacity-90' }, 'Proposed')
                ]),
                h('div', { className: 'flex items-center gap-3' }, [
                    h('div', { style: { width: '32px', height: '8px', border: '2px dashed #800000', borderRadius: '2px' } }),
                    h('span', { className: 'opacity-90' }, 'Abandoned')
                ])
            ]),
            h(components.Button, {
                onClick: () => setShowLegend(false),
                className: 'w-full mt-2 hover:bg-white/5',
                style: { borderColor: 'rgba(255, 255, 255, 0.2)', color: '#e5e7eb' },
                size: 'sm',
                variant: 'outline'
            }, 'Back')
        ];

        const renderTutorial = () => [
            h('div', { 
                key: 'header',
                className: 'flex items-center gap-2 pb-2',
                style: { borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }
            }, [
                h('span', { className: 'font-semibold text-sm' }, 'How to get data'),
            ]),
            h('div', { className: 'text-xs space-y-2 max-h-[300px] overflow-y-auto mt-2' }, [
                h('p', {}, '1. Go to http://overpass-turbo.eu'),
                h('p', {}, '2. Move map to your city area'),
                h('p', {}, '3. Use this query (click to copy):'),
                h('div', { 
                    className: 'p-2 rounded text-[10px] font-mono cursor-pointer transition-colors hover:bg-black/40',
                    style: { backgroundColor: 'rgba(0, 0, 0, 0.3)', color: '#e5e7eb', border: '1px solid rgba(255, 255, 255, 0.1)' },
                    onClick: copyQuery,
                    title: 'Click to copy'
                }, copySuccess ? 'Copied to clipboard!' : `[out:json][timeout:25][bbox:{{bbox}}];
(
  way[railway];
  way[public_transport=platform][train=yes];
  way[public_transport=platform][subway=yes];
  way[public_transport=platform][light_rail=yes];
  way[public_transport=platform][tram=yes];
  node[railway=station];
);
out body;
>;
out skel qt;`),
                h('p', {}, '4. Click "Run", then "Export" -> "raw data"'),
                h('p', {}, '5. Upload the file here using "Upload File"')
            ]),
            h(components.Button, {
                onClick: () => setShowTutorial(false),
                className: 'w-full mt-2',
                size: 'sm',
                variant: 'outline'
            }, 'Back')
        ];

        const renderMain = () => [
            h('div', { 
                key: 'header',
                className: 'flex items-center gap-2 pb-2',
                style: { borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }
            }, [
                h(Train, { className: 'w-4 h-4 text-gray-400' }),
                h('span', { className: 'font-semibold text-sm' }, 'Railway Overlay'),
                hasData && h('span', {
                    className: 'ml-auto text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30'
                }, 'Loaded')
            ]),
            
            h('div', {
                key: 'lines',
                className: 'flex items-center justify-between py-1'
            }, [
                h('div', { className: 'flex items-center gap-2' }, [
                    h(Train, { className: 'w-3.5 h-3.5 text-gray-400' }),
                    h('span', { className: 'text-sm opacity-90' }, 'Show Lines')
                ]),
                h(components.Switch, {
                    checked: enabled,
                    onCheckedChange: handleToggleLines
                })
            ]),
            
            h('div', {
                key: 'labels',
                className: 'flex items-center justify-between py-1'
            }, [
                h('div', { className: 'flex items-center gap-2' }, [
                    h(Tag, { className: 'w-3.5 h-3.5 text-gray-400' }),
                    h('span', { className: 'text-sm opacity-90' }, 'Station Labels')
                ]),
                h(components.Switch, {
                    checked: labels,
                    disabled: !hasData,
                    onCheckedChange: handleToggleLabels
                })
            ]),

            h('div', { className: 'h-px my-2', style: { backgroundColor: 'rgba(255, 255, 255, 0.1)' } }),
            
            !showPaste && h(components.Button, {
                key: 'legend-btn',
                onClick: () => setShowLegend(true),
                className: 'w-full mb-2 text-gray-300 hover:text-white hover:bg-white/5',
                size: 'sm',
                variant: 'ghost'
            }, [
                h(Info, { className: 'w-3 h-3 mr-2' }),
                'Legend'
            ]),
            
            !showPaste ? [
                h(components.Button, {
                    key: 'tutorial-btn',
                    onClick: () => setShowTutorial(true),
                    className: 'w-full mb-2 text-gray-200 hover:bg-white/10',
                    style: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)' },
                    size: 'sm',
                    variant: 'secondary'
                }, [
                    h(FileText, { className: 'w-3 h-3 mr-2' }),
                    'How to get data'
                ]),

                h(components.Button, {
                    key: 'upload-btn',
                    onClick: () => fileInputRef.current?.click(),
                    disabled: !currentCity,
                    className: 'w-full mb-2 text-gray-200 hover:bg-white/5',
                    style: { borderColor: 'rgba(255, 255, 255, 0.2)' },
                    size: 'sm',
                    variant: 'outline'
                }, [
                    h(Upload, { className: 'w-3 h-3 mr-2' }),
                    'Upload File'
                ]),
                h('input', {
                    key: 'file-input',
                    type: 'file',
                    ref: fileInputRef,
                    className: 'hidden',
                    accept: '.json,.geojson',
                    onChange: handleFileUpload
                }),

                h(components.Button, {
                    key: 'paste-btn',
                    onClick: () => setShowPaste(true),
                    disabled: !currentCity,
                    className: 'w-full text-gray-200 hover:bg-white/5',
                    style: { borderColor: 'rgba(255, 255, 255, 0.2)' },
                    size: 'sm',
                    variant: 'outline'
                }, [
                    h(FileText, { className: 'w-3 h-3 mr-2' }),
                    'Paste Data'
                ])
            ] : [
                h('textarea', {
                    key: 'paste-area',
                    value: pasteContent,
                    onChange: (e) => setPasteContent(e.target.value),
                    className: 'w-full h-24 text-xs p-2 rounded mb-2 resize-none font-mono placeholder:text-gray-500 focus:border-emerald-500/50 outline-none',
                    style: { backgroundColor: 'rgba(0, 0, 0, 0.3)', borderColor: 'rgba(255, 255, 255, 0.1)', color: '#e5e7eb', borderWidth: '1px', borderStyle: 'solid' },
                    placeholder: 'Paste OSM JSON data here...'
                }),
                h('div', { key: 'paste-actions', className: 'flex gap-2' }, [
                    h(components.Button, {
                        onClick: () => { setShowPaste(false); setPasteContent(''); },
                        size: 'sm',
                        variant: 'ghost',
                        className: 'flex-1 hover:bg-white/10 text-gray-300'
                    }, 'Cancel'),
                    h(components.Button, {
                        onClick: handlePasteImport,
                        size: 'sm',
                        className: 'flex-1 bg-emerald-600 hover:bg-emerald-500 text-white border-0'
                    }, 'Import')
                ])
            ],
            
            !hasData && !showPaste && h('div', {
                key: 'info',
                className: 'text-xs text-gray-500 mt-2'
            }, 'Download or import data to see railways')
        ];
        
        return h('div', { className: 'relative' }, [
            h('button', {
                key: 'button',
                ref: buttonRef,
                onClick: () => setIsOpen(!isOpen),
                className: `p-2 rounded transition-all duration-200 relative group has-tooltip ${isOpen ? 'bg-black/80' : 'hover:bg-black/50'}`,
                title: 'Railway Overlay'
            }, [
                h(Train, { 
                    key: 'icon', 
                    className: `w-5 h-5 transition-colors ${hasData ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'text-gray-200'}` 
                }),
                h('div', {
                    className: 'absolute inset-0 rounded bg-emerald-500/0 hover:bg-emerald-500/10 transition-colors pointer-events-none'
                })
            ]),
            
            isOpen && h('div', {
                key: 'panel',
                className: 'railway-overlay-panel fixed rounded-xl shadow-2xl p-4 space-y-4 z-50',
                style: {
                    left: '16px',
                    bottom: '80px',
                    width: '320px',
                    maxHeight: '500px',
                    backgroundColor: 'rgba(17, 17, 17, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f3f4f6'
                }
            }, showLegend ? renderLegend() : (showTutorial ? renderTutorial() : renderMain()))
        ]);
    };
    
    api.ui.registerComponent('bottom-bar', {
        id: 'railway-overlay-panel',
        component: RailwayPanel
    });
    
    api.hooks.onMapReady(async (map) => {
        console.log('[Railway Overlay] Map ready');
        if (currentCity) {
            console.log(`[Railway Overlay] Triggering deferred load for ${currentCity}`);
            await loadRailwayOverlay(currentCity, false);
        }
    });
    
    api.hooks.onCityLoad(async (cityCode) => {
        console.log(`[Railway Overlay] City loaded: ${cityCode}`);
        currentCity = cityCode;
        
        if (window.RailwayData[cityCode]) {
            console.log(`[Railway Overlay] Found embedded data for ${cityCode}`);
            api.ui.showNotification(`DEBUG: Found data for ${cityCode}`, 'info');
        } else {
            console.log(`[Railway Overlay] No embedded data for ${cityCode}, will auto-download`);
            api.ui.showNotification(`DEBUG: No data for ${cityCode}`, 'info');
        }
        
        await loadRailwayOverlay(cityCode, false);
        
        const map = api.utils.getMap();
        if (map) {
            const railwayLayers = map.getStyle().layers.filter(l => l.id.includes('railway-layer-'));
            api.ui.showNotification(`DEBUG: Created ${railwayLayers.length} railway layers`, 'info');
        }
    });
    
    console.log('[Railway Overlay] Mod initialized successfully');
    
})();
