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
    let showLabels = false;
    let isLoading = false;
    let hasDownloadedForCity = new Set();
    let lastLoadedData = null;
    let pendingCityLoad = null;
    let mapReady = false;
    let styleGuardAttached = false;
    let styleGuardTimer = null;
    let styleGuardRunning = false;
    let styleGuardLastRun = 0;
    let stationPopup = null;
    const stationPopupHandlers = new Set();
    let stationTooltipEl = null;

    // DIAGNOSTICS STATE
    const diagnostics = {
        fsEnabled: false,
        initError: null,
        dataDir: 'Unknown',
        filesFound: [],
        lastCity: null,
        loadAttempt: null,
        loadResult: null,
        env: {
            require: typeof window.require,
            dirname: typeof __dirname
        }
    };
    
    // Back to dash patterns for now; bridges get a dot-dash for variation.
    const RAILWAY_STYLES = {
        rail: {
            surface: { color: '#5e5e5e', width: 3, zOffset: 0 },
            tunnel: { color: '#7e7e7e', width: 2, zOffset: -1, dasharray: [4, 2] },
            bridge: { color: '#5e5e5e', width: 3, zOffset: 1, dasharray: [6, 2, 1, 2] } // dash + dot
        },
        rail_yard: {
            surface: { color: '#919191', width: 2, zOffset: 0 },
            tunnel: { color: '#919191', width: 1.5, zOffset: -1, dasharray: [4, 2] },
            bridge: { color: '#919191', width: 2, zOffset: 1, dasharray: [6, 2, 1, 2] }
        },
        subway: {
            surface: { color: '#0000cc', width: 3.5, zOffset: 0 },
            tunnel: { color: '#0000cc', width: 3.5, zOffset: -1, dasharray: [3, 2] },
            bridge: { color: '#0000cc', width: 3.5, zOffset: 1, dasharray: [6, 2, 1, 2] }
        },
        light_rail: {
            surface: { color: '#0033ff', width: 3, zOffset: 0 },
            tunnel: { color: '#0033ff', width: 3, zOffset: -1, dasharray: [3, 2] },
            bridge: { color: '#0033ff', width: 3, zOffset: 1, dasharray: [6, 2, 1, 2] }
        },
        tram: {
            surface: { color: '#ff00ff', width: 2.5, zOffset: 0 },
            tunnel: { color: '#ff00ff', width: 2, zOffset: -1, dasharray: [3, 2] },
            bridge: { color: '#ff00ff', width: 2.5, zOffset: 1, dasharray: [6, 2, 1, 2] }
        },
        narrow_gauge: {
            surface: { color: '#ff00ff', width: 2, zOffset: 0 },
            tunnel: { color: '#ff00ff', width: 1.5, zOffset: -1, dasharray: [3, 2] },
            bridge: { color: '#ff00ff', width: 2, zOffset: 1, dasharray: [6, 2, 1, 2] }
        },
        construction: {
            surface: { color: '#f20000', width: 3, zOffset: 0 },
            tunnel: { color: '#f20000', width: 2.5, zOffset: -1, dasharray: [4, 2] },
            bridge: { color: '#f20000', width: 3, zOffset: 1, dasharray: [6, 2, 1, 2] }
        },
        proposed: {
            surface: { color: '#ffb300', width: 2.5, zOffset: 0 },
            tunnel: { color: '#ffb300', width: 2, zOffset: -1, dasharray: [4, 2] },
            bridge: { color: '#ffb300', width: 2.5, zOffset: 1, dasharray: [6, 2, 1, 2] }
        },
        abandoned: {
            surface: { color: '#800000', width: 2, zOffset: 0 },
            tunnel: { color: '#00abab', width: 1.5, zOffset: -1, dasharray: [2, 3] },
            bridge: { color: '#00abab', width: 2, zOffset: 1, dasharray: [6, 2, 1, 2] }
        },
        platform: {
            surface: { color: '#0073ff', width: 2, zOffset: 0 },
            tunnel: { color: '#0073ff', width: 2, zOffset: -1 },
            bridge: { color: '#0073ff', width: 2, zOffset: 1, dasharray: [6, 2, 1, 2] }
        }
    };


    const TEXTURE_FILES = {
        tunnel: 'tunnelrailwayline_nn.png',
        bridge: 'solidrailwayline_nn.png',
        bridgeDetail: 'railwayline_nn.png',
        abandoned: 'abandonedrailwayline_nn.png'
    };

    const TEXTURE_IDS = {
        tunnel: 'railway-tunnel-pattern',
        bridge: 'railway-bridge-pattern',
        bridgeDetail: 'railway-bridge-detail-pattern',
        abandoned: 'railway-abandoned-pattern'
    };

    const textureState = {
        loading: false,
        loaded: false,
        available: {
            tunnel: false,
            bridge: false,
            bridgeDetail: false,
            abandoned: false
        }
    };
    
    // File system access is restricted in this environment
    let useFileSystem = false;
    
    // We will use IndexedDB for persistence
    console.log('[Railway Overlay] initialized. Persistence via IndexedDB');
    
    const DB_STORE = {
        dbName: 'RailwayOverlayDB',
        storeName: 'cityData',
        version: 2, // Bump version to force upgrade needs if store is missing
        
        _dbPromise: null,

        connect() {
            if (this._dbPromise) return this._dbPromise;

            this._dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    console.log(`[Railway Overlay] Upgrading DB from ${event.oldVersion} to ${event.newVersion}`);
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        console.log(`[Railway Overlay] Creating object store: ${this.storeName}`);
                        db.createObjectStore(this.storeName);
                    }
                };

                request.onsuccess = (event) => {
                    const db = event.target.result;
                    // Double check store exists on success
                    if (!db.objectStoreNames.contains(this.storeName)) {
                         console.error(`[Railway Overlay] CRITICAL: Store ${this.storeName} missing after open!`);
                         // If we are here, something is weird. We might need to delete and recreate.
                         // But for now, let it resolve, the transaction will fail.
                    }
                    resolve(db);
                };

                request.onerror = (event) => {
                    console.error('[Railway Overlay] IndexedDB connect error:', event.target.error);
                    reject(event.target.error);
                };
            });
            return this._dbPromise;
        },

        async get(key) {
            try {
                const db = await this.connect();
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction([this.storeName], 'readonly');
                    const store = transaction.objectStore(this.storeName);
                    const request = store.get(key);

                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => {
                        console.error('[Railway Overlay] DB Get Request Error', request.error);
                        reject(request.error); 
                    };
                });
            } catch (err) {
                console.error('[Railway Overlay] DB Get Error:', err);
                return null;
            }
        },

        async set(key, value) {
            try {
                const db = await this.connect();
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction([this.storeName], 'readwrite');
                    const store = transaction.objectStore(this.storeName);
                    const request = store.put(value, key);

                    request.onsuccess = () => resolve(true);
                    request.onerror = () => {
                        console.error('[Railway Overlay] DB Put Request Error', request.error);
                        reject(request.error);
                    };
                });
            } catch (err) {
                console.error('[Railway Overlay] DB Set Error:', err);
                throw err;
            }
        }
    };

    let cacheData = {};
    let cacheVersion = 0;
    
    // Load city data from storage
    async function loadCityData(cityCode) {
        return await loadFromCache(cityCode);
    }

    async function loadFromCache(cityCode) {
        try {
            console.log(`[Railway Overlay] Checking storage for ${cityCode}...`);
            
            // 1. Check Memory
            if (window.RailwayData && window.RailwayData[cityCode]) {
                return window.RailwayData[cityCode]; 
            }

            // 2. Check IndexedDB
            const key = `railway_mod_${cityCode}`;
            const stored = await DB_STORE.get(key);
            
            if (stored) {
                console.log(`[Railway Overlay] ✅ Loaded ${cityCode} from IndexedDB`);
                window.RailwayData[cityCode] = stored;
                return stored;
            }
            
            console.log(`[Railway Overlay] No data found for ${cityCode}`);
        } catch (e) {
            console.error('[Railway Overlay] Failed to load data:', e);
        }
        return null;
    }

    async function saveToCache(cityCode, data) {
        try {
            // 1. Save to Memory
            window.RailwayData[cityCode] = data;
            
            // 2. Save to IndexedDB
            console.log(`[Railway Overlay] Saving ${cityCode} to IndexedDB...`);
            const key = `railway_mod_${cityCode}`;
            
            // Ensure data is cloneable (strip functions if any, though JSON shouldn't have them)
            // But we already assume it is from JSON.parse so it is clean.
            await DB_STORE.set(key, data);
            
            console.log(`[Railway Overlay] ✅ Saved to IndexedDB`);
            api.ui.showNotification('Data saved locally!', 'success');
            return true;
        } catch (e) {
            console.error('[Railway Overlay] Error saving data:', e);
            api.ui.showNotification('Failed to save data. ' + e.message, 'warning');
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

    function resolveAssetUrls(filename) {
        const urls = [];

        if (api?.utils?.getModAssetUrl) {
            try {
                urls.push(api.utils.getModAssetUrl(filename));
            } catch (e) {}
        }

        if (api?.utils?.getModUrl) {
            try {
                urls.push(api.utils.getModUrl(filename));
            } catch (e) {}
        }

        const origin = window.location?.origin;
        if (origin) {
            urls.push(`${origin}/mods/citymapper/${filename}`);
            urls.push(`${origin}/mods/${filename}`);
        }

        urls.push(`./${filename}`);

        return Array.from(new Set(urls.filter(Boolean)));
    }

    function loadImageFromUrls(urls) {
        return new Promise((resolve, reject) => {
            if (!urls || urls.length === 0) {
                reject(new Error('No asset URLs provided'));
                return;
            }

            let index = 0;
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const tryNext = () => {
                if (index >= urls.length) {
                    reject(new Error('Unable to load texture from any URL'));
                    return;
                }
                const url = urls[index++];
                img.onload = () => resolve({ img, url });
                img.onerror = () => tryNext();
                img.src = url;
            };

            tryNext();
        });
    }

    async function ensureRailwayTextures(map) {
        if (textureState.loaded || textureState.loading) return textureState.available;
        if (!map || typeof map.addImage !== 'function') return false;

        textureState.loading = true;
        const loadOne = async (key) => {
            try {
                const id = TEXTURE_IDS[key];
                const hasImage = typeof map.hasImage === 'function' ? map.hasImage(id) : false;
                if (hasImage) {
                    textureState.available[key] = true;
                    return true;
                }

                const urls = resolveAssetUrls(TEXTURE_FILES[key]);
                const { img } = await loadImageFromUrls(urls);
                map.addImage(id, img);
                textureState.available[key] = true;
                return true;
            } catch (e) {
                console.warn(`[Railway Overlay] Texture load failed for ${key}:`, e);
                textureState.available[key] = false;
                return false;
            }
        };

        await loadOne('tunnel');
        await loadOne('bridge');
        await loadOne('abandoned');
        await loadOne('bridgeDetail');

        textureState.loaded = true;
        textureState.loading = false;

        return textureState.available;
    }

    function getLinePatternId(railType, context) {
        // Textures are intentionally off right now (dash arrays only).
        return null;
    }

    function buildBridgeDetailPaint(railStyle) {
        if (!textureState.available.bridgeDetail) return null;
        return {
            'line-pattern': TEXTURE_IDS.bridgeDetail,
            'line-width': Math.max(1, railStyle.width - 1),
            'line-opacity': overlayEnabled ? (railStyle.opacity || 1.0) : 0
        };
    }

    function buildRailwayPaint(railType, context, railStyle) {
        const patternId = getLinePatternId(railType, context);
        const paint = {
            'line-width': railStyle.width,
            'line-opacity': overlayEnabled ? (railStyle.opacity || 1.0) : 0
        };

        if (patternId) {
            paint['line-pattern'] = patternId;
        } else {
            paint['line-color'] = railStyle.color;
            if (railStyle.dasharray) {
                paint['line-dasharray'] = railStyle.dasharray;
            }
        }

        return paint;
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
                (props.railway && ['station', 'halt', 'stop'].includes(props.railway)) ||
                (props.public_transport === 'station')
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
        
        const chunkSize = 10000;
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
            if (node.tags.railway && ['station', 'halt', 'stop'].includes(node.tags.railway)) {
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

        const style = map.getStyle();
        if (!style || !style.layers) {
            isLoading = false;
            return;
        }
        
        const data = await fetchRailwayData(cityCode, forceRefresh);
        
        if (!data) {
            isLoading = false;
            return;
        }
        
        const { layerData, stations } = data;

        await ensureRailwayTextures(map);
        
        lastLoadedData = { layerData, stations, cityCode };
        lastLoadedData.sampleLayerId = getSampleLayerId(layerData, cityCode);
        
        removeExistingLayers(cityCode);
        
        const layers = style.layers;
        const insertBeforeId = getLabelInsertId(style);
        
        let totalFeatures = 0;
        
        const orderedTypes = ['rail', 'rail_yard', 'narrow_gauge', 'subway', 'light_rail', 'tram', 'construction', 'proposed', 'abandoned', 'platform'];
        const orderedContexts = ['tunnel', 'surface', 'bridge'];
        const styleData = style;
        const existingSources = new Set(Object.keys(styleData.sources || {}));
        const existingLayers = new Set((styleData.layers || []).map(l => l.id));
        
        orderedTypes.forEach(railType => {
            orderedContexts.forEach(context => {
                const key = `${railType}_${context}`;
                const features = layerData[key];
                
                if (!features || features.length === 0) return;
                
                const railStyle = RAILWAY_STYLES[railType]?.[context];
                if (!railStyle) return;
                
                totalFeatures += features.length;
                
                try {
                    const sourceId = `railway-${cityCode}-${key}`;
                    const layerId = `railway-layer-${cityCode}-${key}`;
                    
                    if (existingSources.has(sourceId)) return;
                    
                    map.addSource(sourceId, {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: features }
                    });
                    existingSources.add(sourceId);
                    
                    if (existingLayers.has(layerId)) return;
                    
                    map.addLayer({
                        id: layerId,
                        type: 'line',
                        source: sourceId,
                        paint: buildRailwayPaint(railType, context, railStyle),
                        layout: {
                            'visibility': 'visible',
                            'line-cap': 'round',
                            'line-join': 'round'
                        }
                    }, insertBeforeId || undefined);
                    existingLayers.add(layerId);

                    if (context === 'bridge') {
                        const detailPaint = buildBridgeDetailPaint(railStyle);
                        const detailLayerId = `${layerId}-detail`;
                        if (detailPaint && !existingLayers.has(detailLayerId)) {
                            map.addLayer({
                                id: detailLayerId,
                                type: 'line',
                                source: sourceId,
                                paint: detailPaint,
                                layout: {
                                    'visibility': 'visible',
                                    'line-cap': 'round',
                                    'line-join': 'round'
                                }
                            }, insertBeforeId || undefined);
                            existingLayers.add(detailLayerId);
                        }
                    }
                } catch (e) {
                    console.error(`[Railway Overlay] Failed to create layer ${key}:`, e);
                }
            });
        });
        
        if (stations.length > 0) {
            try {
                const stationSourceId = `railway-stations-${cityCode}`;
                
                if (!map.getSource(stationSourceId)) {
                    map.addSource(stationSourceId, {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: stations }
                    });
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
                            'circle-opacity': showLabels ? 1.0 : 0,
                            'circle-stroke-opacity': showLabels ? 1.0 : 0
                        },
                        layout: { 'visibility': showLabels ? 'visible' : 'none' },
                        minzoom: 12
                    }, insertBeforeId || undefined);
                }

                ensureStationTooltipHandlers(map, cityCode);
            } catch (e) {
                console.error('[Railway Overlay] Failed to create station layers:', e);
            }
        }

        reorderRailwayLayers(map, cityCode);
        
        isLoading = false;
    }
    
    function removeExistingLayers(cityCode) {
        const map = api.utils.getMap();
        if (!map || !cityCode) return;
        
        const style = map.getStyle();
        if (!style || !style.layers || !style.sources) return;
        
        console.log(`[Railway Overlay] Removing existing layers for ${cityCode}`);
        
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
        
        console.log(`[Railway Overlay] Removed ${layersToRemove.length} layers and ${sourcesToRemove.length} sources for ${cityCode}`);
    }

    function getLabelInsertId(style) {
        if (!style?.layers) return null;
        for (let i = style.layers.length - 1; i >= 0; i--) {
            const layer = style.layers[i];
            if (layer.type === 'symbol' || layer.id.includes('label') || layer.id.includes('text')) {
                return layer.id;
            }
        }
        return null;
    }

    function getSampleLayerId(layerData, cityCode) {
        if (!layerData) return null;
        const orderedTypes = ['rail', 'rail_yard', 'narrow_gauge', 'subway', 'light_rail', 'tram', 'construction', 'proposed', 'abandoned', 'platform'];
        const orderedContexts = ['tunnel', 'surface', 'bridge'];
        for (const railType of orderedTypes) {
            for (const context of orderedContexts) {
                const key = `${railType}_${context}`;
                const features = layerData[key];
                if (features && features.length > 0) {
                    return `railway-layer-${cityCode}-${key}`;
                }
            }
        }
        return null;
    }

    function getTaggedLineLabel(props) {
        const raw = props?.line || props?.route_ref || props?.ref || null;
        if (!raw) return null;
        const parts = String(raw)
            .split(/[,;|/]+/)
            .map(p => p.trim())
            .filter(Boolean);
        if (parts.length === 0) return null;
        return parts.join(', ');
    }

    function buildStationTooltipHTML(props) {
        const name = props?.name || 'Unknown Station';
        const operator = props?.operator || props?.network || null;
        const line = props?.line || props?.route_ref || props?.ref || null;
        const railwayType = props?.railway || props?.public_transport || null;

        const lines = [
            `<div style="font-weight:600; font-size:12px;">${name}</div>`
        ];

        if (operator) {
            lines.push(`<div style="opacity:0.9; font-size:11px;">Operator: ${operator}</div>`);
        }
        if (line) {
            lines.push(`<div style="opacity:0.9; font-size:11px;">Line: ${line}</div>`);
        }
        if (railwayType && !operator && !line) {
            lines.push(`<div style="opacity:0.8; font-size:11px;">${railwayType}</div>`);
        }

        return `<div style="color:#e5e7eb;">${lines.join('')}</div>`;
    }

    function ensureStationTooltipHandlers(map, cityCode) {
        const dotsLayerId = `railway-station-dots-${cityCode}`;
        if (stationPopupHandlers.has(dotsLayerId)) return;
        if (!map.getLayer(dotsLayerId)) return;

        const PopupClass = (window.maplibregl && window.maplibregl.Popup) ? window.maplibregl.Popup : null;
        if (PopupClass && !stationPopup) {
            stationPopup = new PopupClass({
                closeButton: false,
                closeOnClick: false,
                offset: 10,
                maxWidth: '260px'
            });
        }

        if (!stationTooltipEl) {
            stationTooltipEl = document.createElement('div');
            stationTooltipEl.style.position = 'absolute';
            stationTooltipEl.style.pointerEvents = 'none';
            stationTooltipEl.style.background = 'rgba(17,17,17,0.9)';
            stationTooltipEl.style.border = '1px solid rgba(255,255,255,0.12)';
            stationTooltipEl.style.borderRadius = '8px';
            stationTooltipEl.style.padding = '6px 8px';
            stationTooltipEl.style.fontSize = '12px';
            stationTooltipEl.style.zIndex = '9999';
            stationTooltipEl.style.display = 'none';
            map.getContainer().appendChild(stationTooltipEl);
        }

        map.on('mousemove', dotsLayerId, (e) => {
            if (!showLabels) return;
            map.getCanvas().style.cursor = 'pointer';
            const feature = e.features?.[0];
            if (!feature) return;
            const html = buildStationTooltipHTML(feature.properties || {});
            if (stationPopup) {
                stationPopup.setLngLat(e.lngLat).setHTML(html).addTo(map);
            } else if (stationTooltipEl) {
                stationTooltipEl.innerHTML = html;
                stationTooltipEl.style.display = 'block';
                const { x, y } = e.point;
                stationTooltipEl.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
            }
        });

        map.on('mouseleave', dotsLayerId, () => {
            map.getCanvas().style.cursor = '';
            if (stationPopup) stationPopup.remove();
            if (stationTooltipEl) stationTooltipEl.style.display = 'none';
        });

        stationPopupHandlers.add(dotsLayerId);
    }

    function reorderRailwayLayers(map, cityCode) {
        const style = map?.getStyle();
        if (!style?.layers) return;
        const insertBeforeId = getLabelInsertId(style);

        const orderedTypes = ['rail', 'rail_yard', 'narrow_gauge', 'subway', 'light_rail', 'tram', 'construction', 'proposed', 'abandoned', 'platform'];
        const orderedContexts = ['tunnel', 'surface', 'bridge'];

        orderedTypes.forEach(railType => {
            orderedContexts.forEach(context => {
                const key = `${railType}_${context}`;
                const layerId = `railway-layer-${cityCode}-${key}`;
                if (map.getLayer(layerId)) {
                    try {
                        if (insertBeforeId) {
                            map.moveLayer(layerId, insertBeforeId);
                        } else {
                            map.moveLayer(layerId);
                        }
                    } catch (e) {}
                }

                if (context === 'bridge') {
                    const detailLayerId = `${layerId}-detail`;
                    if (map.getLayer(detailLayerId)) {
                        try {
                            if (insertBeforeId) {
                                map.moveLayer(detailLayerId, insertBeforeId);
                            } else {
                                map.moveLayer(detailLayerId);
                            }
                        } catch (e) {}
                    }
                }
            });
        });

        const dotsLayerId = `railway-station-dots-${cityCode}`;
        if (map.getLayer(dotsLayerId)) {
            try {
                if (insertBeforeId) {
                    map.moveLayer(dotsLayerId, insertBeforeId);
                } else {
                    map.moveLayer(dotsLayerId);
                }
            } catch (e) {}
        }
    }
    
    async function reapplyLayers(map, data) {
        const { layerData, stations, cityCode } = data;
        
        const layers = map.getStyle().layers;
        const insertBeforeId = getLabelInsertId(map.getStyle());

        await ensureRailwayTextures(map);
        
        const orderedTypes = ['rail', 'rail_yard', 'narrow_gauge', 'subway', 'light_rail', 'tram', 'construction', 'proposed', 'abandoned', 'platform'];
        const orderedContexts = ['tunnel', 'surface', 'bridge'];
        const styleData = map.getStyle();
        const existingSources = new Set(Object.keys(styleData.sources || {}));
        const existingLayers = new Set((styleData.layers || []).map(l => l.id));
        
        orderedTypes.forEach(railType => {
            orderedContexts.forEach(context => {
                const key = `${railType}_${context}`;
                const features = layerData[key];
                
                if (!features || features.length === 0) return;
                
                const railStyle = RAILWAY_STYLES[railType]?.[context];
                if (!railStyle) return;
                
                try {
                    const sourceId = `railway-${cityCode}-${key}`;
                    const layerId = `railway-layer-${cityCode}-${key}`;
                    
                    if (!existingSources.has(sourceId)) {
                        map.addSource(sourceId, {
                            type: 'geojson',
                            data: { type: 'FeatureCollection', features: features }
                        });
                        existingSources.add(sourceId);
                    }
                    
                    if (!existingLayers.has(layerId)) {
                        map.addLayer({
                            id: layerId,
                            type: 'line',
                            source: sourceId,
                            paint: buildRailwayPaint(railType, context, railStyle),
                            layout: {
                                'visibility': 'visible',
                                'line-cap': 'round',
                                'line-join': 'round'
                            }
                        }, insertBeforeId || undefined);
                        existingLayers.add(layerId);

                        if (context === 'bridge') {
                            const detailPaint = buildBridgeDetailPaint(railStyle);
                            const detailLayerId = `${layerId}-detail`;
                            if (detailPaint && !existingLayers.has(detailLayerId)) {
                                map.addLayer({
                                    id: detailLayerId,
                                    type: 'line',
                                    source: sourceId,
                                    paint: detailPaint,
                                    layout: {
                                        'visibility': 'visible',
                                        'line-cap': 'round',
                                        'line-join': 'round'
                                    }
                                }, insertBeforeId || undefined);
                                existingLayers.add(detailLayerId);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[Railway Overlay] Failed to reapply layer ${key}:`, e);
                }
            });
        });
        
        if (stations && stations.length > 0) {
            try {
                const stationSourceId = `railway-stations-${cityCode}`;
                const dotsLayerId = `railway-station-dots-${cityCode}`;
                
                if (!existingSources.has(stationSourceId)) {
                    map.addSource(stationSourceId, {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: stations }
                    });
                }
                
                if (!existingLayers.has(dotsLayerId)) {
                    map.addLayer({
                        id: dotsLayerId,
                        type: 'circle',
                        source: stationSourceId,
                        paint: {
                            'circle-radius': 4,
                            'circle-color': '#FFFFFF',
                            'circle-stroke-width': 2,
                            'circle-stroke-color': '#000000',
                            'circle-opacity': showLabels ? 1.0 : 0,
                            'circle-stroke-opacity': showLabels ? 1.0 : 0
                        },
                        layout: { 'visibility': showLabels ? 'visible' : 'none' },
                        minzoom: 12
                    }, insertBeforeId || undefined);
                }

                ensureStationTooltipHandlers(map, cityCode);
            } catch (e) {
                console.error('[Railway Overlay] Failed to reapply station layers:', e);
            }
        }
        
        reorderRailwayLayers(map, cityCode);
        console.log(`[Railway Overlay] Reapplied layers for ${cityCode}`);
    }
    
    api.hooks.onTrackBuilt(() => {
        if (lastLoadedData && lastLoadedData.cityCode === currentCity) {
            const map = api.utils.getMap();
            const style = map?.getStyle();
            if (map && style?.layers) {
                const existingLayers = style.layers.filter(l => l.id.includes(`railway-layer-${currentCity}`));
                if (existingLayers.length === 0) {
                    console.log(`[Railway Overlay] 🔨 Layers removed during building, restoring...`);
                    reapplyLayers(map, lastLoadedData);
                }
            }
        }
    });

    function attachStyleGuard(map) {
        if (styleGuardAttached || !map) return;
        styleGuardAttached = true;

        const guard = async () => {
            try {
                if (styleGuardRunning) return;
                const now = Date.now();
                if (now - styleGuardLastRun < 200) return;
                styleGuardLastRun = now;
                styleGuardRunning = true;

                if (!overlayEnabled) return;
                if (!currentCity || !lastLoadedData || lastLoadedData.cityCode !== currentCity) return;
                const style = map.getStyle();
                if (!style?.layers) return;

                const sampleId = lastLoadedData.sampleLayerId;
                const sampleExists = sampleId ? !!map.getLayer(sampleId) : false;
                if (!sampleExists) {
                    const existingLayers = style.layers.filter(l => l.id.includes(`railway-layer-${currentCity}`));
                    if (existingLayers.length > 0) {
                        return;
                    }
                    console.log(`[Railway Overlay] Style change detected, restoring layers for ${currentCity}`);
                    await reapplyLayers(map, lastLoadedData);
                }
            } catch (e) {
                // Silent guard failures
            } finally {
                styleGuardRunning = false;
            }
        };

        const scheduleGuard = () => {
            if (styleGuardTimer) return;
            styleGuardTimer = setTimeout(() => {
                styleGuardTimer = null;
                guard();
            }, 120);
        };

        map.on('styledata', scheduleGuard);
        map.on('style.load', scheduleGuard);
    }
    
    function toggleOverlay(enabled) {
        overlayEnabled = enabled;
        if (!currentCity) return;
        const map = api.utils.getMap();
        const style = map?.getStyle();
        if (!map || !style?.layers) return;
        
        style.layers.forEach(layer => {
            if (layer.id.includes(`railway-layer-`)) {
                try {
                    map.setPaintProperty(layer.id, 'line-opacity', enabled ? 1.0 : 0);
                } catch (e) {}
            }
            if (layer.id.includes(`railway-station-dots-`)) {
                try {
                    map.setPaintProperty(layer.id, 'circle-opacity', (enabled && showLabels) ? 1.0 : 0);
                    map.setPaintProperty(layer.id, 'circle-stroke-opacity', (enabled && showLabels) ? 1.0 : 0);
                    map.setLayoutProperty(layer.id, 'visibility', (enabled && showLabels) ? 'visible' : 'none');
                } catch (e) {}
            }
        });
        
        if (!enabled) {
            style.layers.forEach(layer => {
                if (layer.id.includes(`railway-station-dots-`)) {
                    try {
                        map.setPaintProperty(layer.id, 'circle-opacity', 0);
                        map.setPaintProperty(layer.id, 'circle-stroke-opacity', 0);
                        map.setLayoutProperty(layer.id, 'visibility', 'none');
                    } catch (e) {}
                }
            });
        }
    }
    
    function toggleLabels(enabled) {
        showLabels = enabled;
        if (!currentCity) return;
        const map = api.utils.getMap();
        const style = map?.getStyle();
        if (!map || !style?.layers) return;
        
        if (!overlayEnabled) return;
        
        style.layers.forEach(layer => {
            if (layer.id.includes(`railway-station-dots-`)) {
                try {
                    map.setPaintProperty(layer.id, 'circle-opacity', enabled ? 1.0 : 0);
                    map.setPaintProperty(layer.id, 'circle-stroke-opacity', enabled ? 1.0 : 0);
                    map.setLayoutProperty(layer.id, 'visibility', enabled ? 'visible' : 'none');
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
        const [showDiagnostics, setShowDiagnostics] = React.useState(false);
        const [pasteContent, setPasteContent] = React.useState('');
        const [copySuccess, setCopySuccess] = React.useState(false);
        const [diagState, setDiagState] = React.useState(diagnostics); // Local copy for forcing updates
        const [selectedStation, setSelectedStation] = React.useState(null);

        // Force update diagnostics every second when open
        React.useEffect(() => {
            if (showDiagnostics) {
                const interval = setInterval(() => setDiagState({...diagnostics}), 1000);
                return () => clearInterval(interval);
            }
        }, [showDiagnostics]);
        const buttonRef = React.useRef(null);
        const panelRef = React.useRef(null);
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
            const interval = setInterval(checkData, 3000);
            return () => clearInterval(interval);
        }, [currentCity]);

        React.useEffect(() => {
            const handler = (e) => {
                setSelectedStation(e.detail || null);
                if (!isOpen) setIsOpen(true);
            };
            window.addEventListener('railway-station-selected', handler);
            return () => window.removeEventListener('railway-station-selected', handler);
        }, [isOpen]);

        React.useEffect(() => {
            if (!isOpen) return;
            
            const handleClickOutside = (e) => {
                if (buttonRef.current && buttonRef.current.contains(e.target)) return;
                if (panelRef.current && panelRef.current.contains(e.target)) return;
                setIsOpen(false);
            };
            
            const observer = new MutationObserver(() => {
                if (!isOpen) return;
                // If another panel opens, close ours
                const openPanels = document.querySelectorAll('.panel, .modal, .dialog');
                for (const el of openPanels) {
                    if (panelRef.current && panelRef.current.contains(el)) continue;
                    // Close when a different panel is visible
                    if (el && el.offsetParent !== null) {
                        setIsOpen(false);
                        break;
                    }
                }
            });
            
            setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutside);
                observer.observe(document.body, { childList: true, subtree: true, attributes: true });
            }, 100);
            
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
                observer.disconnect();
            };
        }, [isOpen]);
        
        const handleToggleLines = (checked) => {
            setEnabled(checked);
            toggleOverlay(checked);
        };
        
        const handleToggleLabels = (checked) => {
            setLabels(checked);
            if (!checked) {
                setSelectedStation(null);
            }
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
                api.ui.showNotification('Data cached successfully', 'success');
            } else {
                api.ui.showNotification('Warning: Could not save to cache', 'warning');
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
                h('span', { className: 'font-semibold text-sm' }, 'Import Instructions'),
            ]),
            h('div', { className: 'text-xs space-y-3 max-h-[300px] overflow-y-auto mt-2' }, [
                h('div', { className: 'bg-blue-500/10 border border-blue-500/30 rounded p-2' }, [
                    h('p', { className: 'font-semibold text-blue-300 mb-1' }, '1. Get Data'),
                    h('p', {}, 'Go to http://overpass-turbo.eu'),
                    h('p', {}, 'Move map to your city area')
                ]),
                
                h('div', { className: 'bg-green-500/10 border border-green-500/30 rounded p-2' }, [
                    h('p', { className: 'font-semibold text-green-300 mb-1' }, '2. Run Query'),
                    h('div', { 
                        className: 'p-2 rounded text-[10px] font-mono cursor-pointer transition-colors hover:bg-black/40 mt-1',
                        style: { backgroundColor: 'rgba(0, 0, 0, 0.3)', color: '#e5e7eb', border: '1px solid rgba(255, 255, 255, 0.1)' },
                        onClick: copyQuery,
                        title: 'Click to copy'
                    }, copySuccess ? '✓ Copied!' : `[out:json][timeout:25][bbox:{{bbox}}];
(
  way[railway];
  node[railway=station];
  way[public_transport=platform];
);
out geom;`),
                    h('p', { className: 'mt-1' }, 'Click "Run" -> "Export" -> "raw data"')
                ]),
                
                h('div', { className: 'bg-purple-500/10 border border-purple-500/30 rounded p-2' }, [
                    h('p', { className: 'font-semibold text-purple-300 mb-1' }, '3. Import Here'),
                    h('p', {}, 'Click "Import Data" below and drag in the file, or paste the text content.'),
                    h('p', { className: 'text-emerald-400 mt-1' }, 'Data is saved forever for this city!')
                ])
            ]),
            h(components.Button, {
                onClick: () => setShowTutorial(false),
                className: 'w-full mt-2',
                size: 'sm',
                variant: 'outline'
            }, 'Back')
        ];

        const renderDiagnostics = () => [
            h('div', { 
                key: 'header',
                className: 'flex items-center gap-2 pb-2',
                style: { borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }
            }, [
                h('span', { className: 'font-semibold text-sm text-red-400' }, 'Diagnostics'),
            ]),
            h('div', { className: 'text-xs space-y-2 mt-2 font-mono overflow-auto max-h-[300px]' }, [
                h('div', { className: 'p-2 bg-black/40 rounded' }, [
                    h('p', {}, `FS Enabled: ${diagState.fsEnabled}`),
                    h('p', {}, `Init Error: ${diagState.initError || 'None'}`),
                    h('p', {}, `__dirname: ${typeof diagState.env.dirname === 'string' ? 'String' : diagState.env.dirname}`),
                ]),
                h('div', { className: 'p-2 bg-black/40 rounded' }, [
                    h('p', { className: 'font-bold' }, 'Paths:'),
                    h('p', { className: 'break-all text-[10px]' }, `Data Dir: ${diagState.dataDir}`),
                    h('p', { className: 'break-all text-[10px]' }, `Target: ${diagState.targetPath || 'N/A'}`)
                ]),
                h('div', { className: 'p-2 bg-black/40 rounded' }, [
                    h('p', { className: 'font-bold' }, 'Status:'),
                    h('p', {}, `Last City: ${diagState.lastCity || 'None'}`),
                    h('p', {}, `Result: ${diagState.loadResult || 'Pending'}`),
                    h('p', {}, `Found Files: ${diagState.filesFound.join(', ') || 'None'}`)
                ])
            ]),
            h(components.Button, {
                onClick: () => {
                     // Nuke DB
                     const key = `railway_mod_${currentCity}`;
                     window.RailwayData[currentCity] = null;
                     indexedDB.deleteDatabase('RailwayOverlayDB');
                     api.ui.showNotification('Database reset. Please restart game.', 'warning');
                     setTimeout(() => location.reload(), 1000);
                },
                className: 'w-full mt-2 bg-red-900/40 hover:bg-red-900/60 text-red-200 border-red-800',
                size: 'sm',
                variant: 'destructive'
            }, 'HARD RESET MAPPING DATABASE'),
            h(components.Button, {
                onClick: () => setShowDiagnostics(false),
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
                    className: 'ml-auto text-xs bg-cyan-500/15 text-cyan-300 px-2 py-0.5 rounded border border-cyan-400/30'
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
                    h('span', { className: 'text-sm opacity-90' }, 'Station Dots')
                ]),
                h(components.Switch, {
                    checked: labels,
                    disabled: !hasData,
                    onCheckedChange: handleToggleLabels
                })
            ]),

            selectedStation && h('div', {
                key: 'station-card',
                className: 'rounded-lg p-3 text-xs border border-white/10 bg-black/30'
            }, [
                h('div', { className: 'font-semibold text-sm mb-1' }, selectedStation.name || 'Unknown Station'),
                (selectedStation.operator || selectedStation.network) && h('div', { className: 'opacity-80' }, `Operator: ${selectedStation.operator || selectedStation.network}`),
                h('div', { className: 'opacity-80' }, `Line: ${getTaggedLineLabel(selectedStation) || 'Unknown'}`),
                selectedStation.railway && h('div', { className: 'opacity-70' }, `Type: ${selectedStation.railway}`)
            ]),

            h('div', { className: 'h-px my-2', style: { backgroundColor: 'rgba(255, 255, 255, 0.1)' } }),
            
            !showPaste && h(components.Button, {
                key: 'legend-btn',
                onClick: () => setShowLegend(true),
                className: 'w-full mb-2 text-slate-200 hover:text-white hover:bg-white/10 border border-white/10',
                size: 'sm',
                variant: 'secondary'
            }, [
                h(Info, { className: 'w-3 h-3 mr-2' }),
                'Legend'
            ]),
            
            !showPaste && h(components.Button, {
                key: 'tutorial-btn', // Keep key unique
                onClick: () => setShowTutorial(true),
                className: 'w-full mb-1 text-slate-200 hover:text-white hover:bg-white/10 border border-white/10',
                size: 'sm',
                variant: 'secondary'
            }, [
                h(FileText, { className: 'w-3 h-3 mr-2' }),
                'How to get data'
            ]),

            !showPaste && h(components.Button, {
                key: 'import-btn',
                onClick: () => setShowPaste(true),
                className: 'w-full mb-2 text-slate-200 hover:text-white hover:bg-white/10 border border-white/10',
                size: 'sm',
                variant: 'secondary'
            }, [
                h(Upload, { className: 'w-3 h-3 mr-2' }),
                hasData ? 'Update Data (Paste)' : 'Import Data (Paste)'
            ]),

            !showPaste && h(components.Button, {
                key: 'upload-btn',
                onClick: () => fileInputRef.current.click(),
                className: 'w-full mb-2 text-slate-200 hover:text-white hover:bg-white/10 border border-white/10',
                size: 'sm',
                variant: 'secondary'
            }, [
                h(FileText, { className: 'w-3 h-3 mr-2' }),
                hasData ? 'Update File' : 'Upload File'
            ]),

            // Hidden file input
            h('input', {
                type: 'file',
                ref: fileInputRef,
                style: { display: 'none' },
                accept: '.json,.geojson',
                onChange: handleFileUpload
            }),

            showPaste && h('textarea', {
                    key: 'paste-area',
                    value: pasteContent,
                    onChange: (e) => setPasteContent(e.target.value),
                    className: 'w-full h-24 text-xs p-2 rounded mb-2 resize-none font-mono placeholder:text-gray-500 focus:border-emerald-500/50 outline-none',
                    style: { backgroundColor: 'rgba(0, 0, 0, 0.3)', borderColor: 'rgba(255, 255, 255, 0.1)', color: '#e5e7eb', borderWidth: '1px', borderStyle: 'solid' },
                    placeholder: 'Paste OSM JSON data here...'
                }),
            showPaste && h('div', { key: 'paste-actions', className: 'flex gap-2' }, [
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
                ]),
            
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
                ref: panelRef,
                className: 'railway-overlay-panel fixed rounded-xl shadow-2xl p-4 space-y-4 z-50',
                style: {
                    left: '16px',
                    bottom: '80px',
                    width: '320px',
                    maxHeight: '500px',
                    backgroundColor: 'rgba(18, 18, 18, 0.86)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#f3f4f6'
                }
            }, showLegend ? renderLegend() : (showTutorial ? renderTutorial() : renderMain()))
        ]);
    };
    
    let registerRetryTimer = null;
    let panelRegistered = false;

    const registerRailwayPanel = () => {
        if (panelRegistered) return;
        if (api.ui.unregisterComponent) {
            try {
                api.ui.unregisterComponent('bottom-bar', 'railway-overlay-panel');
            } catch (e) {}
        }
        api.ui.registerComponent('bottom-bar', {
            id: 'railway-overlay-panel',
            component: RailwayPanel
        });
        panelRegistered = true;
        console.log('[Railway Overlay] UI component registered');
    };

    registerRailwayPanel();

    // Re-register UI after game-end cleanup (happens on city change)
    api.hooks.onGameEnd(() => {
        panelRegistered = false;
        if (registerRetryTimer) {
            clearTimeout(registerRetryTimer);
        }
        // Defer to run after UI cleanup
        registerRetryTimer = setTimeout(() => {
            registerRailwayPanel();
            registerRetryTimer = null;
        }, 250);
    });
    
    api.hooks.onMapReady(async (map) => {
        console.log(`[Railway Overlay] ========== MAP READY (currentCity: ${currentCity}) ==========`);
        mapReady = true;
        attachStyleGuard(map);
        
        if (pendingCityLoad) {
            const cityToLoad = pendingCityLoad;
            pendingCityLoad = null;
            await loadRailwayOverlay(cityToLoad, false);
        }

        if (!lastLoadedData || pendingCityLoad) {
            console.log(`[Railway Overlay] No cached layer data to restore`);
            return;
        }
        
        if (lastLoadedData.cityCode !== currentCity) {
            console.log(`[Railway Overlay] ⚠️ Layer data mismatch: have ${lastLoadedData.cityCode}, need ${currentCity}. Ignoring.`);
            return;
        }
        
        const style = map.getStyle();
        if (!style?.layers) {
            console.log(`[Railway Overlay] Map style not ready, skipping layer restoration`);
            return;
        }
        
        const existingLayers = style.layers.filter(l => l.id.includes(`railway-layer-${currentCity}`));
        console.log(`[Railway Overlay] Found ${existingLayers.length} existing railway layers for ${currentCity}`);
        
        if (existingLayers.length === 0) {
            console.log(`[Railway Overlay] 🔄 Re-applying ${Object.keys(lastLoadedData.layerData).length} layer groups for ${currentCity}`);
            await reapplyLayers(map, lastLoadedData);
        } else {
            console.log(`[Railway Overlay] ✅ Layers already exist, no restoration needed`);
        }
    });
    
    api.hooks.onCityLoad(async (cityCode) => {
        console.log(`[Railway Overlay] ========== CITY LOAD: ${cityCode} ==========`);
        
        if (currentCity !== cityCode) {
            console.log(`[Railway Overlay] City changed from ${currentCity} to ${cityCode}`);
            removeExistingLayers(currentCity);
            lastLoadedData = null;
        }
        
        currentCity = cityCode;
        
        if (window.RailwayData[cityCode]) {
            console.log(`[Railway Overlay] Found embedded data for ${cityCode}`);
        } else {
            console.log(`[Railway Overlay] No embedded data for ${cityCode}`);
        }

        // Defer load until map style is ready
        pendingCityLoad = cityCode;
        mapReady = false;
        const map = api.utils.getMap();
        const style = map?.getStyle();
        if (style?.layers) {
            mapReady = true;
            await loadRailwayOverlay(cityCode, false);
            pendingCityLoad = null;

            const railwayLayers = style.layers.filter(l => l.id.includes('railway-layer-'));
            console.log(`[Railway Overlay] Loaded ${railwayLayers.length} railway layers for ${cityCode}`);
        }
    });
    
    console.log('[Railway Overlay] Mod initialized successfully');
    
})();