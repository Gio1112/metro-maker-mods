# Modding Guide for Subway Builder

## Latest Modders Build: v0.12.0-rc

**Download Links:**
- **Windows**: [Subway Builder Setup 0.12.0-rc.exe](https://download.subwaybuilder.com/modders/Subway%20Builder%20Setup%200.12.0-rc.exe)
- **Mac ARM64 (M1/M2/M3)**: [Subway Builder-0.12.0-rc-arm64.dmg](https://download.subwaybuilder.com/modders/Subway%20Builder-0.12.0-rc-arm64.dmg)
- **Mac Intel**: [Subway Builder-0.12.0-rc.dmg](https://download.subwaybuilder.com/modders/Subway%20Builder-0.12.0-rc.dmg)
- **Linux**: [Subway Builder-0.12.0-rc.AppImage](https://download.subwaybuilder.com/modders/Subway%20Builder-0.12.0-rc.AppImage)

---

Subway Builder exposes a comprehensive JavaScript API for modding. Mods can add custom cities, map tiles, UI components, game rules, and more.

## Mods Folder Location

The `mods/` folder is located **in the same directory as your `saves/` folder** in your app data directory:

**Full paths by platform:**

- **macOS**: `~/Library/Application Support/metro-maker4/mods/`
- **Windows**: `%APPDATA%\metro-maker4\mods\`
- **Linux**: `~/.config/metro-maker4/mods/`

**Directory structure:**

```
metro-maker4/
├── saves/              ← Your save files are here
├── mods/               ← Put your mods here (create if missing)
│   ├── my-mod/
│   │   ├── manifest.json
│   │   └── index.js
│   └── another-mod/
│       ├── manifest.json
│       └── index.js
└── settings.json
```

**How to find it:**

1. Open Subway Builder
2. Go to Settings > System
3. Click "Open Saves Folder"
4. Navigate up one level - you'll see the `metro-maker4/` folder
5. Create a `mods/` folder if it doesn't exist

## Quick Start

### Browser Console (Quick Testing)

```javascript
// Check if API is loaded
console.log(window.SubwayBuilderAPI.version); // "1.0.0"

// Add a custom city
window.SubwayBuilderAPI.registerCity({
    name: 'Montreal',
    code: 'MTL',
    population: 4_300_000,
    initialViewState: { zoom: 13.5, latitude: 45.5017, longitude: -73.5673, bearing: 0 },
});
```

### Electron Mod (Persistent)

1. Navigate to your mods folder (see above)
2. Create a new folder for your mod: `mods/my-mod/`
3. Add `manifest.json`:

```json
{
    "id": "com.myname.my-mod",
    "name": "My Awesome Mod",
    "description": "Adds cool stuff",
    "version": "1.0.0",
    "author": { "name": "Your Name" },
    "main": "index.js"
}
```

4. Add `index.js`:

```javascript
// Your mod code here
window.SubwayBuilderAPI.registerCity({...});
```

5. Restart the game and enable in Settings > Mods

## API Version

Current version: `1.0.0`

## No Imports Needed

Mods run as plain JavaScript via `new Function()`, so ES6 `import` statements won't work. **But you don't need them!** Everything you need is exposed on `window.SubwayBuilderAPI`:

```javascript
const api = window.SubwayBuilderAPI;

// React & UI - no imports needed!
const { React, icons, components } = api.utils;
const { Button, Card, CardContent, Progress, Switch, Label, Input, Badge } = components;
const { Settings, Play, Pause, Train, MapPin } = icons;  // 1000+ Lucide icons
const h = React.createElement;  // Shorthand for building UI

// Build a full UI without any imports
h(Card, null, [
    h(CardContent, null, [
        h(Button, { onClick: () => api.ui.showNotification('Clicked!') }, 'My Button'),
        h(Progress, { value: 75 }),
        h('div', { className: 'flex items-center gap-2' }, [
            h(Switch, { id: 'toggle' }),
            h(Label, { htmlFor: 'toggle' }, 'Enable feature')
        ])
    ])
]);

// Game data - no imports needed!
const routes = api.gameState.getRoutes();
const budget = api.gameState.getBudget();
const stations = api.gameState.getStations();

// Actions - no imports needed!
api.actions.setMoney(1_000_000_000);
api.actions.setPause(true);
```

**What's exposed:**
- `api.utils.React` → Full React library
- `api.utils.icons` → All Lucide icons (Settings, Play, Train, etc.)
- `api.utils.components` → shadcn/ui components (Button, Card, Progress, Switch, Label, Input, Badge, Tooltip, Slider)
- `api.gameState.*` → All game data (routes, stations, trains, budget, ridership, metrics)
- `api.actions.*` → Game actions (setMoney, setPause, setSpeed)
- `api.hooks.*` → Lifecycle hooks (onGameInit, onDayChange, onGameEnd, etc.)

## Adding Custom Cities

The `cities` export is now `let` instead of `const`, allowing runtime modification.

```javascript
window.SubwayBuilderAPI.registerCity({
    name: 'Montreal',
    code: 'MTL',
    description: 'Build metros beneath the Underground City',
    population: 4_300_000,
    initialViewState: {
        zoom: 13.5,
        latitude: 45.5017,
        longitude: -73.5673,
        bearing: 0,
    },
    minZoom: 10,

    // Optional: Custom thumbnail for city select screen
    // Defaults to /city-maps/{code}.svg if not specified
    mapImageUrl: 'http://127.0.0.1:8080/MTL/thumbnail.svg',
});
```

**City thumbnail:** The city select screen shows a preview image for each city. By default it looks for `/city-maps/{code}.svg` (e.g., `/city-maps/mtl.svg`). Use `mapImageUrl` to provide a custom thumbnail from your mod server or a different path. SVG format recommended (800px wide, uses CSS variables for theming). If the image fails to load, a fallback puzzle icon is shown.

**Modded Cities Tab:** When you register custom cities, they appear in a dedicated "Modded" tab in the city selector (shown only when mods add cities). Modded cities are displayed with:

- Purple-tinted styling to distinguish from built-in cities
- A puzzle icon badge
- "MOD" label if no population data is available
- A count badge on the tab showing how many modded cities are available

### Custom City Tabs

If you're adding multiple cities (e.g., a "Canada" or "Europe" pack), you can register a custom tab to group them:

```javascript
// First, register your cities
window.SubwayBuilderAPI.registerCity({
    name: 'Montreal',
    code: 'MTL',
    // ... city config
});

window.SubwayBuilderAPI.registerCity({
    name: 'Toronto',
    code: 'YYZ',
    // ... city config
});

// Then register a tab to group them
window.SubwayBuilderAPI.cities.registerTab({
    id: 'canada',
    label: 'Canada',
    emoji: '🇨🇦',
    cityCodes: ['MTL', 'YYZ'],
});
```

**Tab properties:**

- `id` (required): Unique identifier for the tab
- `label` (required): Display name shown in the tab button
- `emoji` (optional): Emoji shown next to the label (e.g., country flag)
- `cityCodes` (required): Array of city codes that belong to this tab

Custom tabs appear between the built-in country tabs (US, UK) and the "Modded" catch-all tab. Cities in a custom tab are styled with purple accents similar to modded cities.

**Required files in `public/data/MTL/`:**

- `metadata.json` - City metadata
- `demand_data.json` - Population demand points
- `buildings_index.json` - Building data (optional)

## Map Customization

### Add Custom Tile Source

```javascript
window.SubwayBuilderAPI.map.registerSource('custom-tiles', {
    type: 'raster',
    tiles: ['https://tile.server.com/{z}/{x}/{y}.png'],
    tileSize: 256,
});
```

### Add Custom Map Layer

```javascript
window.SubwayBuilderAPI.map.registerLayer({
    id: 'custom-layer',
    type: 'fill',
    source: 'custom-tiles',
    paint: {
        'fill-color': '#088',
        'fill-opacity': 0.5,
    },
});
```

### Add Custom MapLibre Style

```javascript
window.SubwayBuilderAPI.map.registerStyle('https://demotiles.maplibre.org/style.json');
```

## Game Constants

### Modify at Runtime

```javascript
window.SubwayBuilderAPI.modifyConstants({
    STARTING_MONEY: 10_000_000_000, // 10B instead of 3B
    DEFAULT_TICKET_COST: 5,
    CONSTRUCTION_COSTS: {
        TUNNEL: {
            SINGLE_MULTIPLIER: 0.5, // Half the normal cost
        },
    },
});
```

### Edit JSON File (Electron)

Game constants are stored in `public/data/game-rules.json` (not obfuscated). Modders can edit this file directly for permanent changes:

```json
{
    "rules": {
        "STARTING_MONEY": 10000000000,
        "DEFAULT_TICKET_COST": 5,
        "CONSTRUCTION_COSTS": {
            "TUNNEL": {
                "SINGLE_MULTIPLIER": 0.5
            }
        }
    }
}
```

## Train Types

### Register a New Train Type

```javascript
window.SubwayBuilderAPI.trains.registerTrainType({
    id: 'commuter-rail',
    name: 'Commuter Rail',
    description: 'High-capacity regional rail for longer distances',
    stats: {
        maxAcceleration: 0.8,
        maxDeceleration: 1.0,
        maxSpeed: 40, // m/s (~90 mph)
        maxSpeedLocalStation: 15,
        capacityPerCar: 150,
        carLength: 25,
        minCars: 4,
        maxCars: 12,
        carsPerCarSet: 2,
        carCost: 3_000_000,
        trainWidth: 3.2,
        minStationLength: 200,
        maxStationLength: 400,
        baseTrackCost: 40_000,
        baseStationCost: 60_000_000,
        trainOperationalCostPerHour: 600,
        carOperationalCostPerHour: 60,
        scissorsCrossoverCost: 20_000_000,
    },
    compatibleTrackTypes: ['commuter-rail'],
    appearance: {
        color: '#8b5cf6',
    },
});
```

### Modify Existing Train Type

```javascript
// Make heavy metro faster and cheaper
window.SubwayBuilderAPI.trains.modifyTrainType('heavy-metro', {
    stats: {
        maxSpeed: 30, // Faster top speed
        carCost: 2_000_000, // Cheaper cars
    },
    appearance: {
        color: '#ef4444', // Red instead of blue
    },
});
```

### Get Train Types

```javascript
// Get all train types
const allTypes = window.SubwayBuilderAPI.trains.getTrainTypes();
console.log(Object.keys(allTypes)); // ['heavy-metro', 'light-metro', 'commuter-rail']

// Get specific train type
const heavyMetro = window.SubwayBuilderAPI.trains.getTrainType('heavy-metro');
console.log(heavyMetro.stats.maxSpeed);
```

### Custom Elevation Cost Multipliers

Override global elevation cost multipliers for specific train types. Useful for trams (cheaper at-grade) or commuter rail (different tunneling costs):

```javascript
window.SubwayBuilderAPI.trains.registerTrainType({
    id: 'tram',
    name: 'Streetcar',
    description: 'Light rail for street running',
    stats: {
        baseTrackCost: 15_000, // Cheaper base cost
        // ... other stats
    },
    compatibleTrackTypes: ['tram'],
    appearance: { color: '#f59e0b' },

    // Override elevation multipliers (optional)
    elevationMultipliers: {
        AT_GRADE: 0.5, // Even cheaper at grade (trams are designed for streets)
        ELEVATED: 1.8, // More expensive elevated (trams don't elevate well)
        CUT_AND_COVER: 1.2, // Slightly more expensive tunnels
        // DEEP_BORE and STANDARD_TUNNEL use global defaults if not specified
    },
});
```

**Elevation types:**

- `DEEP_BORE` - Deep tunnels (typically < -30m)
- `STANDARD_TUNNEL` - Standard tunnels (-30m to -8m)
- `CUT_AND_COVER` - Shallow tunnels (-8m to -3m)
- `AT_GRADE` - Street level (-3m to 4.5m)
- `ELEVATED` - Above ground (> 4.5m)

### At-Grade Road Crossing (Trams/Streetcars)

Standard metros cannot cross roads at grade - they must tunnel or elevate. For trams and streetcars that run on streets, enable `allowAtGradeRoadCrossing`:

```javascript
window.SubwayBuilderAPI.trains.registerTrainType({
    id: 'tram',
    name: 'Streetcar',
    description: 'Light rail for street running',
    stats: {
        /* ... */
    },
    compatibleTrackTypes: ['tram'],
    appearance: { color: '#f59e0b' },

    // Allow tracks to cross roads at grade (for trams/streetcars)
    allowAtGradeRoadCrossing: true,
    // Or use the alias for compatibility with existing mods:
    // canCrossRoads: true,
});
```

**Note:** Both `allowAtGradeRoadCrossing` and `canCrossRoads` are supported. Use `allowAtGradeRoadCrossing` for new mods.

**Important:** This only affects regular road collision detection. Runways and taxiways still block at-grade tracks regardless of this setting (safety first!).

## UI Customization

### UI Primitives

Add buttons, toggles, sliders, and more to the game UI without needing React:

```javascript
const api = window.SubwayBuilderAPI;

// Add a button
api.ui.addButton('settings-menu', {
    id: 'my-button',
    label: 'Click Me',
    icon: 'Zap', // Lucide icon name (optional)
    onClick: () => console.log('Button clicked!'),
});

// Add a toggle switch
api.ui.addToggle('settings-menu', {
    id: 'my-toggle',
    label: 'Enable Feature',
    defaultValue: false,
    onChange: (enabled) => console.log('Toggle:', enabled),
});

// Add a slider
api.ui.addSlider('settings-menu', {
    id: 'speed-slider',
    label: 'Speed',
    min: 1,
    max: 10,
    step: 1,
    defaultValue: 5,
    onChange: (value) => console.log('Speed:', value),
});

// Add a dropdown select
api.ui.addSelect('settings-menu', {
    id: 'mode-select',
    label: 'Mode',
    options: [
        { value: 'easy', label: 'Easy' },
        { value: 'normal', label: 'Normal' },
        { value: 'hard', label: 'Hard' },
    ],
    defaultValue: 'normal',
    onChange: (value) => console.log('Mode:', value),
});

// Add text/label
api.ui.addText('settings-menu', {
    id: 'info-text',
    text: 'My Mod v1.0.0',
    className: 'text-sm text-muted-foreground', // optional
});

// Add a separator line
api.ui.addSeparator('settings-menu', { id: 'my-separator' });
```

**Available placements:**

- `settings-menu` - Mod settings in Settings panel
- `escape-menu` - Custom menu items in escape menu
- `bottom-bar` - Bottom UI bar (next to clock, money)
- `top-bar` - Top UI bar (right side toolbar)
- `debug-panel` - Debug info panel (when debug mode enabled)

**Available icons:** Any icon from [Lucide Icons](https://lucide.dev/icons) - use the PascalCase name (e.g., `Zap`, `Settings`, `Train`, `MapPin`)

### Show Notifications

```javascript
window.SubwayBuilderAPI.ui.showNotification('Mod loaded successfully!', 'success');
window.SubwayBuilderAPI.ui.showNotification('Something went wrong', 'error');
```

### Theme Control

Control the app's light/dark theme programmatically:

```javascript
// Set theme (light, dark, or system)
window.SubwayBuilderAPI.ui.setTheme('dark');
window.SubwayBuilderAPI.ui.setTheme('light');
window.SubwayBuilderAPI.ui.setTheme('system'); // Follow OS preference

// Get current theme setting
const themeSetting = window.SubwayBuilderAPI.ui.getTheme(); // 'light' | 'dark' | 'system'

// Get the actual resolved theme (useful when set to 'system')
const actualTheme = window.SubwayBuilderAPI.ui.getResolvedTheme(); // 'light' | 'dark'
```

**Example: Day/Night Cycle Mod**

A complete example mod that automatically switches theme based on in-game time is available at: https://github.com/ejfox/subway-builder-mods

### Color Customization

Customize the app's accent and primary colors:

```javascript
// Set accent color (used for highlights, buttons, etc.)
window.SubwayBuilderAPI.ui.setAccentColor('#8b5cf6'); // Purple

// Set primary color (used for text and UI elements)
window.SubwayBuilderAPI.ui.setPrimaryColor('#0ea5e9'); // Sky blue

// Set any CSS variable directly
window.SubwayBuilderAPI.ui.setCSSVariable('--radius', '0.75rem');

// Reset all colors to defaults
window.SubwayBuilderAPI.ui.resetColors();
```

### Custom UI Components (Advanced)

Register custom React components in specific UI placements:

```javascript
const { React, components } = window.SubwayBuilderAPI.utils;
const h = React.createElement;

// Register a button in the escape menu
window.SubwayBuilderAPI.ui.registerComponent('escape-menu-buttons', {
    id: 'my-mod-button',
    component: () => h(components.Button, {
        onClick: () => console.log('Clicked!'),
        className: 'w-full'
    }, 'My Mod Button')
});

// Register in main menu
window.SubwayBuilderAPI.ui.registerComponent('main-menu', {
    id: 'my-mod-menu-item',
    component: () => h('div', { className: 'text-sm' }, 'My Mod')
});

// Get all registered components for a placement
const escapeMenuComponents = window.SubwayBuilderAPI.ui.getComponents('escape-menu-buttons');
```

**Available placements for registerComponent:**
- `escape-menu-buttons` - Buttons in the escape/pause menu
- `main-menu` - Items in the main menu
- `settings-menu` - Items in the settings panel

## Custom Content

### Newspaper Templates

```javascript
window.SubwayBuilderAPI.registerNewspaperTemplates([
    {
        headline: 'Montreal Metro Reaches {{STATIONS}} Stations',
        content: 'The STM celebrated today...',
        metadata: {
            category: 'milestone',
            tone: 'celebratory',
            requiredGameState: {
                minStations: 10,
            },
            weight: 8,
        },
    },
]);
```

### Tweet Templates

```javascript
window.SubwayBuilderAPI.registerTweetTemplates([
    {
        text: 'omg {{CITY}} metro is fire 🔥',
        tone: 'excited',
        requiredGameState: {
            minPassengers: 1000,
        },
    },
]);
```

## Lifecycle Hooks

### Game Initialize

```javascript
window.SubwayBuilderAPI.hooks.onGameInit(() => {
    console.log('Game initialized!');
});
```

### Day Change

```javascript
window.SubwayBuilderAPI.hooks.onDayChange((day) => {
    if (day % 100 === 0) {
        console.log(`Milestone: Day ${day}!`);
    }
});
```

### City Load

```javascript
window.SubwayBuilderAPI.hooks.onCityLoad((cityCode) => {
    console.log(`Loaded city: ${cityCode}`);
    if (cityCode === 'MTL') {
        // Do Montreal-specific initialization
    }
});
```

### Map Ready

```javascript
window.SubwayBuilderAPI.hooks.onMapReady((map) => {
    console.log('Map is ready!', map);
    // Access raw MapLibre instance
    map.on('click', (e) => {
        console.log('Clicked:', e.lngLat);
    });
});
```

### Station Built

```javascript
window.SubwayBuilderAPI.hooks.onStationBuilt((station) => {
    console.log(`Station built: ${station.name}`);
    // Called when a blueprint station is constructed
});
```

### Route Created

```javascript
window.SubwayBuilderAPI.hooks.onRouteCreated((route) => {
    console.log(`New route created: ${route.name} with ${route.stations.length} stations`);
});
```

### Track Built

```javascript
window.SubwayBuilderAPI.hooks.onTrackBuilt((tracks) => {
    console.log(`${tracks.length} tracks constructed`);
    // Called when blueprint tracks are built (converted to actual tracks)
});
```

### Blueprint Placed

```javascript
window.SubwayBuilderAPI.hooks.onBlueprintPlaced((tracks) => {
    console.log(`${tracks.length} blueprint tracks placed`);
    // Called when the player places blueprint tracks (before construction)
});
```

### Demand Change

```javascript
window.SubwayBuilderAPI.hooks.onDemandChange((popCount) => {
    console.log(`Demand data loaded: ${popCount} commuter groups`);
    // Called when demand/population data is loaded for a city
});
```

### Track Change

```javascript
window.SubwayBuilderAPI.hooks.onTrackChange((changeType, count) => {
    console.log(`Tracks ${changeType}: ${count} tracks`);
    // changeType is 'add' or 'delete'
    // Called when tracks are added or removed from the map
});
```

### Train Spawned

```javascript
window.SubwayBuilderAPI.hooks.onTrainSpawned((train) => {
    console.log(`Train spawned on route ${train.routeId}`);
    // Called when a new train is generated
});
```

### Train Deleted

```javascript
window.SubwayBuilderAPI.hooks.onTrainDeleted((trainId, routeId) => {
    console.log(`Train ${trainId} deleted from route ${routeId}`);
    // Called when a train is removed from service
});
```

### Route Deleted

```javascript
window.SubwayBuilderAPI.hooks.onRouteDeleted((routeId, routeBullet) => {
    console.log(`Route ${routeBullet} deleted`);
    // Called when a route is deleted
});
```

### Pause Changed

```javascript
window.SubwayBuilderAPI.hooks.onPauseChanged((isPaused) => {
    console.log(`Game ${isPaused ? 'paused' : 'resumed'}`);
    // Called when game is paused or unpaused
});
```

### Speed Changed

```javascript
window.SubwayBuilderAPI.hooks.onSpeedChanged((newSpeed) => {
    console.log(`Game speed changed to: ${newSpeed}`);
    // newSpeed is 'slow', 'normal', 'fast', or 'ultrafast'
});
```

### Money Changed

```javascript
window.SubwayBuilderAPI.hooks.onMoneyChanged((newBalance, change, type, category) => {
    console.log(`${type}: $${Math.abs(change)} (${category || 'general'})`);
    console.log(`New balance: $${newBalance}`);
    // type is 'revenue' or 'expense'
    // category is present for expenses (e.g., 'construction', 'trainOperational')
});
```

### Game Saved

```javascript
window.SubwayBuilderAPI.hooks.onGameSaved((saveName) => {
    console.log(`Game saved: ${saveName}`);
    // Called after the game is saved (manual or autosave)
});
```

### Game Loaded

```javascript
window.SubwayBuilderAPI.hooks.onGameLoaded((saveName) => {
    console.log(`Game loaded: ${saveName}`);
    // Called after a save is loaded
});
```

## Game Actions

Mods can perform actions that modify game state.

### Add/Subtract Money

```javascript
// Add money (income/bonus)
window.SubwayBuilderAPI.actions.addMoney(1000000, 'bonus');

// Subtract money (expense/penalty)
window.SubwayBuilderAPI.actions.subtractMoney(500000, 'maintenance');

// Set exact balance
window.SubwayBuilderAPI.actions.setMoney(10000000);
```

### Pause/Speed Control

```javascript
// Pause the game
window.SubwayBuilderAPI.actions.setPause(true);

// Resume the game
window.SubwayBuilderAPI.actions.setPause(false);

// Set game speed ('slow', 'normal', 'fast', 'ultrafast')
window.SubwayBuilderAPI.actions.setSpeed('fast');
```

## Utilities

### Get All Cities

```javascript
const cities = window.SubwayBuilderAPI.utils.getCities();
console.log(
    'Available cities:',
    cities.map((c) => c.name)
);
```

### Get Game Constants

```javascript
const rules = window.SubwayBuilderAPI.utils.getConstants();
console.log('Starting money:', rules.STARTING_MONEY);
```

### Get Map Instance

```javascript
const map = window.SubwayBuilderAPI.utils.getMap();
if (map) {
    map.setZoom(15);
}
```

## Game State Access

Access current game state (read-only) for analysis, UI mods, or debugging.

### Get Stations

```javascript
const stations = window.SubwayBuilderAPI.gameState.getStations();
console.log('Total stations:', stations.length);

// Station data includes: id, name, coords, stationGroup, etc.
stations.forEach((station) => {
    console.log(`${station.name} at [${station.coords}]`);
});
```

### Get Routes

```javascript
const routes = window.SubwayBuilderAPI.gameState.getRoutes();
routes.forEach((route) => {
    console.log(`Route ${route.name}: ${route.stations.length} stations`);
});
```

### Get Tracks (with Elevation/Depth)

```javascript
const tracks = window.SubwayBuilderAPI.gameState.getTracks();

// Each track has startElevation and endElevation
// Negative values = underground, positive = elevated
tracks.forEach((track) => {
    console.log(`Track ${track.id}: depth ${track.startElevation}m to ${track.endElevation}m`);
});

// Find deepest track
const deepestTrack = tracks.reduce((deepest, track) => {
    const minElev = Math.min(track.startElevation, track.endElevation);
    const deepestElev = Math.min(deepest.startElevation, deepest.endElevation);
    return minElev < deepestElev ? track : deepest;
}, tracks[0]);
console.log('Deepest track:', deepestTrack?.startElevation, 'm');
```

### Get Trains

```javascript
const trains = window.SubwayBuilderAPI.gameState.getTrains();
console.log('Active trains:', trains.length);
```

### Get Demand Data

```javascript
const demandData = window.SubwayBuilderAPI.gameState.getDemandData();
if (demandData) {
    // demandData.points is a Map<string, ExtendedDemandPoint>
    // demandData.popsMap is a Map<string, ExtendedPop>

    console.log('Demand points:', demandData.points.size);
    console.log('Population groups:', demandData.popsMap.size);

    // Iterate over demand points
    demandData.points.forEach((point, id) => {
        console.log(`Point ${id}: ${point.jobs} jobs, ${point.residents} residents`);
    });

    // Iterate over pops (commuter groups)
    demandData.popsMap.forEach((pop, id) => {
        console.log(`Pop ${id}: ${pop.size} commuters, ${pop.drivingSeconds}s drive`);
    });
}
```

### Get Current Day, Hour & Budget

```javascript
const day = window.SubwayBuilderAPI.gameState.getCurrentDay();
const hour = window.SubwayBuilderAPI.gameState.getCurrentHour(); // 0-23
const budget = window.SubwayBuilderAPI.gameState.getBudget();
const elapsedSeconds = window.SubwayBuilderAPI.gameState.getElapsedSeconds();

console.log(`Day ${day}, Hour ${hour}: $${budget.toLocaleString()} remaining`);
console.log(`Total elapsed time: ${elapsedSeconds} seconds`);
```

### Calculate Blueprint Cost

Calculate the total cost of tracks before constructing them.

```javascript
const tracks = window.SubwayBuilderAPI.gameState.getTracks();
const blueprintTracks = tracks.filter((t) => t.displayType === 'blueprint');

const cost = window.SubwayBuilderAPI.gameState.calculateBlueprintCost(blueprintTracks);

console.log('Total cost:', cost.totalCost.toLocaleString());
console.log('Breakdown:');
console.log('  Track cost:', cost.breakdown.trackCost.toLocaleString());
console.log('  Station cost:', cost.breakdown.stationCost.toLocaleString());
console.log('  Scissors crossover:', cost.breakdown.scissorsCrossoverCost.toLocaleString());
console.log('  Building demolition:', cost.breakdown.buildingDemolitionCost.toLocaleString());
```

### Get Game State Info

```javascript
// Ticket price
const ticketPrice = window.SubwayBuilderAPI.gameState.getTicketPrice();
console.log('Ticket price:', ticketPrice);

// Game speed ('slow', 'normal', 'fast', 'ultrafast')
const speed = window.SubwayBuilderAPI.gameState.getGameSpeed();
console.log('Game speed:', speed);

// Pause state
const paused = window.SubwayBuilderAPI.gameState.isPaused();
console.log('Is paused:', paused);
```

### Get Financial Data

```javascript
// Get all bonds
const bonds = window.SubwayBuilderAPI.gameState.getBonds();
console.log('Active bonds:', bonds.length);
bonds.forEach(bond => {
    console.log(`Bond: $${bond.principal} at ${bond.interestRate}%`);
});

// Get bond type definitions
const bondTypes = window.SubwayBuilderAPI.gameState.getBondTypes();
console.log('Available bond types:', Object.keys(bondTypes));
```

### Get Performance Metrics

```javascript
// Ridership statistics
const ridership = window.SubwayBuilderAPI.gameState.getRidershipStats();
console.log('Total riders per hour:', ridership.totalRidersPerHour);
console.log('Total riders all time:', ridership.totalRiders);

// Per-line metrics
const lineMetrics = window.SubwayBuilderAPI.gameState.getLineMetrics();
lineMetrics.forEach(line => {
    console.log(`${line.name}: ${line.ridersPerHour} riders/hr`);
});
```

## Pop Timing Customization

Override the default commute time ranges that determine when commuters travel:

```javascript
// Get current commute time ranges
const ranges = window.SubwayBuilderAPI.popTiming.getCommuteTimeRanges();
console.log('Current ranges:', ranges);
// Default: [{ start: 7, end: 9 }, { start: 17, end: 19 }] (7-9am, 5-7pm)

// Set custom commute times (e.g., for a city with different work patterns)
window.SubwayBuilderAPI.popTiming.setCommuteTimeRanges([
    { start: 6, end: 10 },   // Early morning rush (6am-10am)
    { start: 16, end: 20 },  // Extended evening rush (4pm-8pm)
    { start: 12, end: 14 },  // Lunch rush
]);

// Reset to defaults
window.SubwayBuilderAPI.popTiming.resetCommuteTimeRanges();
```

## Mod Storage (Electron Only)

Mods can persist settings and data using the storage API. Data is stored per-mod in the user's app data directory.

### Save and Load Settings

```javascript
// Save a setting
await window.SubwayBuilderAPI.storage.set('myModEnabled', true);
await window.SubwayBuilderAPI.storage.set('favoriteColor', '#ff0000');
await window.SubwayBuilderAPI.storage.set('userPrefs', { volume: 0.8, notifications: true });

// Load a setting (with optional default value)
const enabled = await window.SubwayBuilderAPI.storage.get('myModEnabled', false);
const color = await window.SubwayBuilderAPI.storage.get('favoriteColor', '#000000');
const prefs = await window.SubwayBuilderAPI.storage.get('userPrefs', {});

console.log('Mod enabled:', enabled);
```

### Delete and List Keys

```javascript
// Delete a stored value
await window.SubwayBuilderAPI.storage.delete('myModEnabled');

// Get all stored keys for this mod
const keys = await window.SubwayBuilderAPI.storage.keys();
console.log('Stored keys:', keys); // ['favoriteColor', 'userPrefs']
```

**Note:** Storage is only available in Electron (desktop app). In browser, storage operations are no-ops. Storage is scoped per-mod based on mod ID from the manifest.

## Hot Reload

During development, you can reload all mods without restarting the game:

```javascript
// Reload all mods (clears mod state and re-executes mod scripts)
await window.SubwayBuilderAPI.reloadMods();
```

This clears:

- All registered callbacks (except mapReady - map is already loaded)
- UI components
- Custom layers, sources, and styles
- Custom train types (keeps built-in heavy-metro and light-metro)
- Custom cities (keeps built-in cities)

The mod loader will then re-execute all enabled mod scripts.

## Data File Schemas

The modding API exposes **Zod schemas** for all custom city data files. Use these to validate your generated data before loading into the game.

### Available Schemas

```javascript
// Access all schemas via the API
const schemas = window.SubwayBuilderAPI.schemas;

// Validate demand data
const demandData = { points: [...], pops: [...] };
const result = schemas.DemandDataSchema.safeParse(demandData);

if (result.success) {
    console.log('✅ Demand data is valid!');
} else {
    console.error('❌ Validation errors:', result.error.errors);
}
```

### Demand Data Format (`demand_data.json`)

```typescript
{
    points: [
        {
            id: "dp_001",
            location: [-97.1463, 49.8718],  // [longitude, latitude]
            jobs: 500,
            residents: 1200,
            popIds: ["pop_001", "pop_002"]
        }
    ],
    pops: [
        {
            id: "pop_001",
            size: 100,                       // Number of commuters in this group
            residenceId: "dp_001",          // Where they live
            jobId: "dp_002",                // Where they work
            drivingSeconds: 1800,           // Driving time in seconds (30 minutes)
            drivingDistance: 15000,         // Distance in meters (15km)

            // Optional: Store the actual driving route geometry
            drivingPath: [                  // GeoJSON LineString coordinates
                [-97.1463, 49.8718],        // Origin (residence)
                [-97.1450, 49.8725],        // Route waypoints...
                [-97.1380, 49.8800],
                [-97.1320, 49.8850]         // Destination (job)
            ]
        }
    ]
}
```

**Schemas:**

- `DemandDataSchema` - Complete file
- `DemandPointSchema` - Single demand point
- `PopSchema` - Single commuter group (includes optional `drivingPath`)

### Computing Driving Routes for Custom Cities

The game needs `drivingSeconds` and `drivingDistance` for each pop to calculate mode choice (driving vs transit vs walking). For custom cities, **you compute these yourself** using a routing service.

#### Option 1: OSRM (Open Source Routing Machine)

```bash
# Download OSM data for your region
wget https://download.geofabrik.de/north-america/canada/manitoba-latest.osm.pbf

# Run OSRM with Docker
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/manitoba-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/manitoba-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/manitoba-latest.osrm
docker run -t -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/manitoba-latest.osrm
```

Then query routes:

```javascript
// OSRM returns duration (seconds) and distance (meters)
const response = await fetch(
    `http://localhost:5000/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=full&geometries=geojson`
);
const data = await response.json();

const pop = {
    id: 'pop_001',
    size: 100,
    residenceId: 'dp_001',
    jobId: 'dp_002',
    drivingSeconds: data.routes[0].duration, // seconds
    drivingDistance: data.routes[0].distance, // meters
    drivingPath: data.routes[0].geometry.coordinates, // [[lon,lat], ...]
};
```

#### Option 2: Valhalla

```bash
# Run Valhalla with Docker
docker run -dt --name valhalla -p 8002:8002 \
    -v $PWD/custom_files:/custom_files \
    ghcr.io/gis-ops/docker-valhalla/valhalla:latest
```

```javascript
const response = await fetch('http://localhost:8002/route', {
    method: 'POST',
    body: JSON.stringify({
        locations: [
            { lon: originLon, lat: originLat },
            { lon: destLon, lat: destLat },
        ],
        costing: 'auto',
        directions_options: { units: 'kilometers' },
    }),
});
const data = await response.json();

const pop = {
    drivingSeconds: data.trip.summary.time,
    drivingDistance: data.trip.summary.length * 1000, // km to meters
    drivingPath: decodePolyline(data.trip.legs[0].shape), // Valhalla uses encoded polyline
};
```

#### Option 3: GraphHopper

```javascript
const response = await fetch(
    `http://localhost:8989/route?point=${originLat},${originLon}&point=${destLat},${destLon}&profile=car&points_encoded=false`
);
const data = await response.json();

const pop = {
    drivingSeconds: data.paths[0].time / 1000, // ms to seconds
    drivingDistance: data.paths[0].distance, // meters
    drivingPath: data.paths[0].points.coordinates,
};
```

#### Example: Generate All Pops with Routing

```javascript
async function generatePopsWithRouting(demandPoints, routingUrl) {
    const pops = [];
    let popId = 0;

    for (const residence of demandPoints.filter((p) => p.residents > 0)) {
        for (const job of demandPoints.filter((p) => p.jobs > 0)) {
            if (residence.id === job.id) continue;

            const route = await fetch(
                `${routingUrl}/${residence.location[0]},${residence.location[1]};${job.location[0]},${job.location[1]}?overview=full&geometries=geojson`
            ).then((r) => r.json());

            if (!route.routes?.[0]) continue;

            // Gravity model: more people commute short distances
            const distKm = route.routes[0].distance / 1000;
            const size = Math.ceil((residence.residents * job.jobs) / distKm ** 2);
            if (size < 1) continue;

            const id = `pop_${popId++}`;
            pops.push({
                id,
                size,
                residenceId: residence.id,
                jobId: job.id,
                drivingSeconds: route.routes[0].duration,
                drivingDistance: route.routes[0].distance,
                drivingPath: route.routes[0].geometry.coordinates,
            });
            residence.popIds.push(id);
        }
    }
    return pops;
}
```

#### Validating Your Generated Data

Use the built-in Zod schemas to validate your demand_data.json before loading:

```javascript
const schemas = window.SubwayBuilderAPI.schemas;
const result = schemas.DemandDataSchema.safeParse(myGeneratedData);

if (!result.success) {
    console.error('Validation errors:', result.error.errors);
}
```

The `drivingPath` field is optional - include it if you want to store/debug route geometries, but the game only requires `drivingSeconds` and `drivingDistance` for mode choice calculations.

#### Using the Routing Service API (Data Generation Only)

> **Note:** This API is for **data generation scripts** (like Node.js scripts that create `demand_data.json`), not for runtime use in mods. The game does not query routing services at runtime - it uses pre-computed `drivingSeconds` and `drivingDistance` from your demand data files. Use this API in your build/generation pipeline.

You can register a routing service and query routes programmatically when generating city data:

```javascript
// 1. Register your routing service
window.SubwayBuilderAPI.map.setRoutingServiceOverride({
    cityCode: 'YWG',
    routingUrl:
        'http://localhost:5000/route/v1/driving/{origin_lon},{origin_lat};{dest_lon},{dest_lat}?overview=full&geometries=geojson',
    format: 'osrm', // 'osrm' | 'valhalla' | 'graphhopper' | 'custom'
});

// 2. Query routes on demand
const result = await window.SubwayBuilderAPI.map.queryRoute(
    'YWG',
    [-97.1463, 49.8718], // origin [lon, lat]
    [-97.132, 49.885] // destination [lon, lat]
);

if (result) {
    console.log('Driving time:', result.drivingSeconds, 'seconds');
    console.log('Distance:', result.drivingDistance, 'meters');
    console.log('Path:', result.drivingPath); // [[lon,lat], ...] or undefined
}
```

**Supported formats:**

- `osrm` - OSRM (duration in seconds, distance in meters, geometry.coordinates)
- `valhalla` - Valhalla (trip.summary.time, trip.summary.length \* 1000, decoded polyline)
- `graphhopper` - GraphHopper (paths[0].time / 1000, paths[0].distance, points.coordinates)
- `custom` - Provide your own parser:

```javascript
window.SubwayBuilderAPI.map.setRoutingServiceOverride({
    cityCode: 'YWG',
    routingUrl: 'http://localhost:3000/api/route?from={origin_lon},{origin_lat}&to={dest_lon},{dest_lat}',
    format: 'custom',
    customParser: (response) => ({
        drivingSeconds: response.time_sec,
        drivingDistance: response.dist_m,
        drivingPath: response.coords, // optional
    }),
});
```

### Building Index Format (`buildings_index.json`)

**Standard Format:**

```typescript
{
    cellSize: 0.01,                  // Spatial grid cell size in degrees
    minLon: -97.3, maxLon: -96.9,   // Bounding box
    minLat: 49.7, maxLat: 50.0,
    cols: 40, rows: 30,              // Grid dimensions
    cells: {
        "0,0": [1, 2, 3],            // Building IDs in each grid cell
        "1,0": [4, 5]
    },
    buildings: [
        {
            id: 1,
            bounds: { minX: -97.15, minY: 49.85, maxX: -97.14, maxY: 49.86, foundationDepth: -5 },
            polygon: [[[-97.15, 49.85], [-97.14, 49.85], ...]],  // GeoJSON Polygon
            foundationDepth: -5      // Negative for underground
        }
    ],
    buildingCount: 5,
    nonEmptyCells: 2,
    maxFoundationDepth: -30
}
```

**Optimized Format (smaller file size):**

```typescript
{
    cs: 0.01,                        // cellSize
    bbox: [-97.3, 49.7, -96.9, 50.0],  // [minLon, minLat, maxLon, maxLat]
    grid: [40, 30],                  // [cols, rows]
    cells: [[0, 0, 1, 2, 3], [1, 0, 4, 5]],  // Sparse array format
    buildings: [
        { b: [-97.15, 49.85, -97.14, 49.86], f: -5, p: [...] }
    ],
    stats: { count: 5, maxDepth: -30 }
}
```

**Schemas:**

- `BuildingIndexSchema` - Standard format
- `OptimizedBuildingIndexSchema` - Optimized format
- `BuildingDataSchema` - Single building

### Roads Format (`roads.geojson`)

```typescript
{
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: [[-97.15, 49.85], [-97.14, 49.86]]
            },
            properties: {
                roadClass: "highway",    // highway | major | medium | minor
                structure: "normal",     // normal | tunnel | bridge
                name: "Main Street"
            }
        }
    ]
}
```

**Schemas:**

- `RoadsGeojsonSchema` - Complete file
- `RoadPropertiesSchema` - Road properties

### Runways/Taxiways Format (`runways_taxiways.geojson`)

```typescript
{
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [-97.15, 49.85], [-97.14, 49.85],
                    [-97.14, 49.86], [-97.15, 49.86], [-97.15, 49.85]
                ]]
            },
            properties: {}  // Optional properties
        }
    ]
}
```

**Schemas:**

- `RunwaysTaxiwaysGeojsonSchema` - Complete file

### Validation Example

```javascript
// Validate all data files before loading
const validateCityData = async (cityCode) => {
    const schemas = window.SubwayBuilderAPI.schemas;

    // Load data files
    const demand = await fetch(`/data/${cityCode}/demand_data.json`).then((r) => r.json());
    const buildings = await fetch(`/data/${cityCode}/buildings_index.json`).then((r) => r.json());
    const roads = await fetch(`/data/${cityCode}/roads.geojson`).then((r) => r.json());

    // Validate each file
    const results = {
        demand: schemas.DemandDataSchema.safeParse(demand),
        buildings: schemas.OptimizedBuildingIndexSchema.safeParse(buildings),
        roads: schemas.RoadsGeojsonSchema.safeParse(roads),
    };

    // Check for errors
    Object.entries(results).forEach(([name, result]) => {
        if (!result.success) {
            console.error(`❌ ${name} validation failed:`, result.error.errors);
        } else {
            console.log(`✅ ${name} is valid`);
        }
    });

    return Object.values(results).every((r) => r.success);
};
```

### Data Generation (Your Responsibility!)

The modding API **does not** generate data for you. You need to:

1. **Download OSM data** - Use Overpass API, planet files, etc.
2. **Process into game format** - Convert OSM buildings → spatial index
3. **Generate demand points** - From census data, random distribution, etc.
4. **Extract roads** - From OSM highway data
5. **Find airports** - From OSM aeroway data

The schemas tell you **what format** the game expects, but you handle the **data generation pipeline**.

**Tools you might use:**

- [Overpass Turbo](https://overpass-turbo.eu/) - Query OSM data
- [GDAL/OGR](https://gdal.org/) - Process GeoJSON
- [Turf.js](https://turfjs.org/) - Spatial operations in JavaScript
- [PMTiles](https://protomaps.com/pmtiles) - Serve vector tiles
- Custom scripts (see Kronifer's patcher for examples)

## Custom Tiles & Data (Kronifer Mode)

If you're serving custom tiles from localhost (like Kronifer's patcher), you can override tile URLs and layer schemas:

### Override Tile URLs for Custom Cities

```javascript
// Instead of patching obfuscated code, just do this:
window.SubwayBuilderAPI.map.setTileURLOverride({
    cityCode: 'YWG', // Winnipeg
    tilesUrl: 'http://127.0.0.1:8080/YWG/{z}/{x}/{y}.mvt',
    foundationTilesUrl: 'http://127.0.0.1:8080/YWG/{z}/{x}/{y}.mvt',
    maxZoom: 15,
});
```

### Override Layer Source-Layers (Custom Tile Schema)

```javascript
// Parks layer uses different source-layer in your tiles
window.SubwayBuilderAPI.map.setLayerOverride({
    layerId: 'parks-large',
    sourceLayer: 'landuse', // Instead of 'parks'
    filter: ['==', ['get', 'kind'], 'park'],
});

// Airports layer
window.SubwayBuilderAPI.map.setLayerOverride({
    layerId: 'airports',
    sourceLayer: 'landuse',
    filter: ['==', ['get', 'kind'], 'aerodrome'],
});

// Water layer height adjustment
window.SubwayBuilderAPI.map.setLayerOverride({
    layerId: 'water',
    paint: {
        'fill-extrusion-height': 0.1, // Instead of 0
    },
});
```

### Set Default Layer Visibility

Disable map layers by default for modded cities (e.g., disable building foundations or ocean depths for cities that don't have that data):

```javascript
// Disable building foundations and ocean depth for Winnipeg
window.SubwayBuilderAPI.map.setDefaultLayerVisibility('YWG', {
    buildingFoundations: false,
    oceanFoundations: false,
    trackElevations: false,
});

// Layer IDs match the keys in LAYER_CONFIG:
// - buildingFoundations: Building foundation depth visualization
// - oceanFoundations: Ocean depth visualization
// - trackElevations: Track elevation labels
// - trains, stations, routes, arrows, signals, etc.
```

The layer defaults are applied when the city loads. Users can still toggle layers manually after loading.

### Set City Data Files

```javascript
window.SubwayBuilderAPI.cities.setCityDataFiles('YWG', {
    buildingsIndex: '/data/YWG/buildings_index.json.gz',
    demandData: '/data/YWG/demand_data.json.gz',
    roads: '/data/YWG/roads.geojson.gz',
    runwaysTaxiways: '/data/YWG/runways_taxiways.geojson.gz',
    oceanDepthIndex: '/data/YWG/ocean_depth_index.json.gz', // Optional
});
```

### Complete Winnipeg Example (Replaces Entire Patcher!)

```javascript
// 1. Register city
window.SubwayBuilderAPI.registerCity({
    name: 'Winnipeg',
    code: 'YWG',
    description: 'chicago if it was tiny',
    population: 850000,
    initialViewState: {
        zoom: 13.5,
        latitude: 49.871881,
        longitude: -97.146345,
        bearing: 0,
    },
});

// 2. Point to localhost tiles
window.SubwayBuilderAPI.map.setTileURLOverride({
    cityCode: 'YWG',
    tilesUrl: 'http://127.0.0.1:8080/YWG/{z}/{x}/{y}.mvt',
    foundationTilesUrl: 'http://127.0.0.1:8080/YWG/{z}/{x}/{y}.mvt',
    maxZoom: 15,
});

// 3. Fix layer schemas for custom tiles
window.SubwayBuilderAPI.map.setLayerOverride({
    layerId: 'parks-large',
    sourceLayer: 'landuse',
    filter: ['==', ['get', 'kind'], 'park'],
});

window.SubwayBuilderAPI.map.setLayerOverride({
    layerId: 'airports',
    sourceLayer: 'landuse',
    filter: ['==', ['get', 'kind'], 'aerodrome'],
});

// 4. Set data files (including your pre-computed demand data with driving times)
window.SubwayBuilderAPI.cities.setCityDataFiles('YWG', {
    buildingsIndex: '/data/YWG/buildings_index.json.gz',
    demandData: '/data/YWG/demand_data.json.gz', // Contains pops with drivingSeconds/drivingDistance
    roads: '/data/YWG/roads.geojson.gz',
    runwaysTaxiways: '/data/YWG/runways_taxiways.geojson.gz',
});

// Done! No asar patching, no obfuscated code modification!
// See "Computing Driving Routes for Custom Cities" section for how to generate demand_data.json
```

## Example: Full European City Mod

```javascript
// Register city
window.SubwayBuilderAPI.registerCity({
    name: 'Berlin',
    code: 'BER',
    description: 'Unite East and West with U-Bahn and S-Bahn networks',
    population: 6_100_000,
    initialViewState: {
        zoom: 13.5,
        latitude: 52.52,
        longitude: 13.405,
        bearing: 0,
    },
});

// Add custom basemap
window.SubwayBuilderAPI.map.registerSource('berlin-osm', {
    type: 'raster',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: '© OpenStreetMap contributors',
});

window.SubwayBuilderAPI.map.registerLayer({
    id: 'berlin-base',
    type: 'raster',
    source: 'berlin-osm',
});

// Custom newspaper for Berlin
window.SubwayBuilderAPI.registerNewspaperTemplates([
    {
        headline: 'BVG Announces {{STATIONS}} U-Bahn Stations Operational',
        content: 'The Berliner Verkehrsbetriebe...',
        metadata: {
            category: 'milestone',
            tone: 'professional',
            requiredGameState: { minStations: 5 },
            weight: 7,
        },
    },
]);

console.log('✅ Berlin mod loaded!');
```

## TypeScript Support

The API is fully typed. If using TypeScript:

```typescript
import type { ModdingAPI } from '@/app/game/moddingAPI';

declare global {
    interface Window {
        SubwayBuilderAPI: ModdingAPI;
    }
}

// Now you get autocomplete!
window.SubwayBuilderAPI.registerCity({
    // TypeScript will validate this
});
```

## Tips

1. **Check API availability**: Always check `window.SubwayBuilderAPI` exists before using
2. **Use hooks for timing**: Register content in `onGameInit` to ensure proper loading
3. **Test incrementally**: Add one feature at a time and verify it works
4. **Check console**: Modding API logs all operations with `[Modding API]` prefix
5. **Cities need data**: Custom cities require data files in `public/data/{CODE}/`

## Debugging

```javascript
// List all registered cities
console.table(window.SubwayBuilderAPI.utils.getCities());

// Get current map instance
const map = window.SubwayBuilderAPI.utils.getMap();
console.log('Map loaded:', !!map);

// Check constants
const rules = window.SubwayBuilderAPI.utils.getConstants();
console.log('Starting money:', rules.STARTING_MONEY);
```

## Contributing Mods

If you create a popular mod (e.g., European cities), consider:

1. Packaging it as a userscript
2. Sharing in Discord (#modding channel)
3. Submitting a PR to add it officially

The community frequently requests European cities, Canadian cities, and custom map styles - these are prime modding targets!
