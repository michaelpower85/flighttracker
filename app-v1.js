// Map Initialization
const map = L.map('map', { zoomControl: false }).setView([40, -40], 3);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Dark Theme Basemap
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// State Variables
let currentCallsign = null;
let pollInterval = null;
let planeMarker = null;
let destinationMarker = null;
let flightPath = null;
let destLatLng = null;

// DOM Elements
const searchForm = document.getElementById('searchForm');
const callsignInput = document.getElementById('callsignInput');
const searchBtnText = document.getElementById('searchBtnText');
const searchSpinner = document.getElementById('searchSpinner');
const dashboard = document.getElementById('dashboard');
const destControls = document.getElementById('destinationControls');
const clearDestBtn = document.getElementById('clearDestBtn');
const toastContainer = document.getElementById('toastContainer');

// Settings Elements
const settingsToggleBtn = document.getElementById('settingsToggleBtn');
const settingsPanel = document.getElementById('settingsPanel');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const saveCredentialsBtn = document.getElementById('saveCredentialsBtn');

// Dashboard Elements
const dashCallsign = document.getElementById('dashCallsign');
const dashSpeed = document.getElementById('dashSpeed');
const dashAltitude = document.getElementById('dashAltitude');
const dashHeading = document.getElementById('dashHeading');
const dashCoords = document.getElementById('dashCoords');
const destStats = document.getElementById('destStats');
const destDist = document.getElementById('destDist');
const destTime = document.getElementById('destTime');

// Utility: Haversine distance in miles
function getDistanceMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Radius of earth in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function showToast(message, type = 'error') {
    const toast = document.createElement('div');
    toast.className = `px-4 py-2 rounded-lg shadow-lg text-sm font-medium transform transition-all duration-300 translate-y-10 opacity-0 ${type === 'error' ? 'bg-red-500/90 text-white' : 'bg-green-500/90 text-white'}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    });

    // Remove after 3s
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Custom Plane Icon SVG
const getPlaneSVG = (color = '#3b82f6') => `
<svg viewBox="0 0 24 24" fill="${color}" stroke="#ffffff" stroke-width="1" class="drop-shadow-md w-8 h-8">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
</svg>
`;

// Fetch and update logic
async function fetchAndPlot(callsign) {
    const targetUrl = 'https://opensky-network.org/api/states/all';
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
    
    try {
        const headers = {};
        const username = localStorage.getItem('opensky_username');
        const password = localStorage.getItem('opensky_password');
        if (username && password) {
            headers['Authorization'] = 'Basic ' + btoa(username + ':' + password);
        }

        console.log(`[DEBUG] Target URL: ${targetUrl}`);
        console.log(`[DEBUG] Proxy URL: ${proxyUrl}`);
        console.log(`[DEBUG] Headers:`, headers);

        const res = await fetch(proxyUrl, { headers });
        console.log(`[DEBUG] Response Status: ${res.status} ${res.statusText}`);

        if (!res.ok) {
            const errorText = await res.text().catch(() => 'Could not read response body');
            console.error(`[DEBUG] Error Response Body:`, errorText);
            throw new Error(`HTTP ${res.status}: ${res.statusText || 'Unknown'}`);
        }
        
        let data;
        const textData = await res.text();
        try {
            data = JSON.parse(textData);
        } catch (jsonErr) {
            console.error(`[DEBUG] Failed to parse JSON. Raw body:`, textData);
            throw new Error(`Failed to parse JSON response: ${jsonErr.message}`);
        }

        console.log(`[DEBUG] States Count: ${data.states ? data.states.length : 0}`);

        if (!data.states || !Array.isArray(data.states)) {
            throw new Error('Response is missing "states" array');
        }

        const state = data.states.find(s => s[1] && s[1].trim() === callsign);
        
        if (!state) {
            console.log(`[DEBUG] Callsign "${callsign}" not found in OpenSky states.`);
            return false;
        }

        const [icao24, csign, origin, time_pos, last_contact, lng, lat, baro_alt, on_ground, velocity, heading] = state;
        
        if (lat === null || lng === null) {
            console.warn(`[DEBUG] Callsign "${callsign}" found, but coordinates are null.`);
            return false;
        }

        const pos = [lat, lng];
        const speedMph = velocity ? Math.round(velocity * 2.23694) : 0;
        const altFt = baro_alt ? Math.round(baro_alt * 3.28084) : 0;
        
        updateDashboard(callsign, speedMph, altFt, heading, lat, lng);
        updateMap(pos, heading);
        
        if (destLatLng) {
            updateDestinationCalculations(lat, lng, speedMph);
        }

        return true;
    } catch (err) {
        console.error(`[DEBUG] Error:`, err);
        return { error: err.message };
    }
}

function updateDashboard(callsign, speed, alt, heading, lat, lng) {
    dashCallsign.textContent = callsign;
    dashSpeed.textContent = speed;
    dashAltitude.textContent = alt.toLocaleString();
    dashHeading.textContent = heading ? Math.round(heading) : '---';
    dashCoords.innerHTML = `${lat.toFixed(4)}&deg;<br>${lng.toFixed(4)}&deg;`;
    
    dashboard.classList.remove('hidden');
    // slight delay for animation
    setTimeout(() => {
        dashboard.classList.remove('opacity-0', 'translate-x-10');
    }, 50);
    
    destControls.classList.remove('hidden');
}

function updateMap(pos, heading) {
    if (!planeMarker) {
        const icon = L.divIcon({
            html: `<div style="transform: rotate(${heading || 0}deg);" class="plane-icon">${getPlaneSVG()}</div>`,
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        planeMarker = L.marker(pos, { icon }).addTo(map);
        map.setView(pos, 6);
    } else {
        planeMarker.setLatLng(pos);
        const iconElement = planeMarker.getElement().querySelector('.plane-icon');
        if (iconElement) {
            iconElement.style.transform = `rotate(${heading || 0}deg)`;
        }
        map.panTo(pos); // Smooth pan to new position
    }

    if (destLatLng) {
        updatePolyline(pos);
    }
}

function updateDestinationCalculations(lat, lng, speedMph) {
    const dist = getDistanceMiles(lat, lng, destLatLng.lat, destLatLng.lng);
    destDist.textContent = Math.round(dist).toLocaleString();
    
    if (speedMph > 0) {
        const hours = dist / speedMph;
        const totalMins = Math.round(hours * 60);
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        destTime.textContent = `${h}h ${m}m`;
    } else {
        destTime.textContent = '---';
    }
}

function updatePolyline(startPos) {
    if (flightPath) map.removeLayer(flightPath);
    flightPath = L.polyline([startPos, [destLatLng.lat, destLatLng.lng]], {
        color: '#3b82f6',
        dashArray: '5, 10',
        weight: 2
    }).addTo(map);
}

// Search form submit
searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const callsign = callsignInput.value.trim().toUpperCase();
    if (!callsign) return;

    // Loading state
    searchBtnText.textContent = 'Searching...';
    searchSpinner.classList.remove('hidden');
    
    const result = await fetchAndPlot(callsign);
    
    searchBtnText.textContent = 'Track Flight';
    searchSpinner.classList.add('hidden');

    if (result === true) {
        currentCallsign = callsign;
        showToast('Flight found! Initiating live tracking.', 'success');
        
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(() => {
            fetchAndPlot(currentCallsign);
        }, 30000); // Poll every 30s
    } else if (result === false) {
        showToast('Flight not found. It may not be airborne or the callsign is incorrect.');
    } else if (result && result.error) {
        showToast(`Error: ${result.error}`);
    } else {
        showToast('Unknown error occurred.');
    }
});

// Map click for destination
map.on('click', (e) => {
    if (!currentCallsign) return;
    
    destLatLng = e.latlng;
    
    if (destinationMarker) {
        destinationMarker.setLatLng(destLatLng);
    } else {
        destinationMarker = L.marker(destLatLng, {
            icon: L.divIcon({
                html: `<svg viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="2" class="w-6 h-6 drop-shadow-lg" style="transform: translate(-50%, -100%);"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>`,
                className: '',
                iconAnchor: [0, 0]
            })
        }).addTo(map);
    }

    destStats.classList.remove('hidden');
    clearDestBtn.classList.remove('hidden');
    
    // Immediate calculation update if plane exists
    if (planeMarker) {
        const pos = planeMarker.getLatLng();
        const speedTxt = dashSpeed.textContent;
        const speedMph = speedTxt !== '---' ? parseInt(speedTxt.replace(/,/g, '')) : 0;
        updateDestinationCalculations(pos.lat, pos.lng, speedMph);
        updatePolyline([pos.lat, pos.lng]);
    }
});

clearDestBtn.addEventListener('click', () => {
    destLatLng = null;
    if (destinationMarker) {
        map.removeLayer(destinationMarker);
        destinationMarker = null;
    }
    if (flightPath) {
        map.removeLayer(flightPath);
        flightPath = null;
    }
    destStats.classList.add('hidden');
    clearDestBtn.classList.add('hidden');
});

// Credentials & Settings Management
if (settingsToggleBtn) {
    settingsToggleBtn.addEventListener('click', () => {
        settingsPanel.classList.toggle('hidden');
    });
}

if (saveCredentialsBtn) {
    // Load existing credentials
    usernameInput.value = localStorage.getItem('opensky_username') || '';
    passwordInput.value = localStorage.getItem('opensky_password') || '';

    saveCredentialsBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (username && password) {
            localStorage.setItem('opensky_username', username);
            localStorage.setItem('opensky_password', password);
            showToast('Credentials saved successfully!', 'success');
            settingsPanel.classList.add('hidden');
        } else {
            localStorage.removeItem('opensky_username');
            localStorage.removeItem('opensky_password');
            showToast('Credentials cleared!', 'success');
            settingsPanel.classList.add('hidden');
        }
    });
}
