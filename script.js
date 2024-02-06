import * as THREE from "https://cdn.skypack.dev/three@0.133.1/build/three.module";
import {OrbitControls} from "https://cdn.skypack.dev/three@0.133.1/examples/jsm/controls/OrbitControls";


    


const containerEl = document.querySelector(".globe-wrapper");
const canvas3D = containerEl.querySelector("#globe-3d");
const canvas2D = containerEl.querySelector("#globe-2d-overlay");
const popupEl = containerEl.querySelector(".globe-popup");

let renderer, scene, camera, rayCaster, controls, group;
let overlayCtx = canvas2D.getContext("2d");
let coordinates2D = [0, 0];
let pointerPos;
let clock, mouse, pointer, globe, globeMesh;
let popupVisible;
let earthTexture, mapMaterial;
let popupOpenTl, popupCloseTl;

let dragged = false;

initScene();
window.addEventListener("resize", updateSize);


function initScene() {
    renderer = new THREE.WebGLRenderer({canvas: canvas3D, alpha: true});
	renderer.setPixelRatio(2);

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0, 3);
    camera.position.z = 1.1;

    rayCaster = new THREE.Raycaster();
    rayCaster.far = 1.15;
    mouse = new THREE.Vector2(-1, -1);
    clock = new THREE.Clock();

    createOrbitControls();

    popupVisible = false;

    new THREE.TextureLoader().load(
        "https://raw.githubusercontent.com/fruitbox12/workflowFunction/main/as.jpg",
        (mapTex) => {
            earthTexture = mapTex;
            earthTexture.repeat.set(1, 1);
            createGlobe();
            createPointer();
            createPopupTimelines();
            addCanvasEvents();
            updateSize();
            render();
        });
}


function createOrbitControls() {
    controls = new OrbitControls(camera, canvas3D);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.minPolarAngle = .4 * Math.PI;
    controls.maxPolarAngle = .4 * Math.PI;
    controls.autoRotate = true;

    let timestamp;
    controls.addEventListener("start", () => {
        timestamp = Date.now();
    });
    controls.addEventListener("end", () => {
        dragged = (Date.now() - timestamp) > 200;
    });
}

function createGlobe() {
    const globeGeometry = new THREE.IcosahedronGeometry(1, 22);
    mapMaterial = new THREE.ShaderMaterial({
        vertexShader: document.getElementById("vertex-shader-map").textContent,
        fragmentShader: document.getElementById("fragment-shader-map").textContent,
        uniforms: {
            u_map_tex: {type: "t", value: earthTexture},
            u_dot_size: {type: "f", value: 0},
            u_pointer: {type: "v3", value: new THREE.Vector3(.0, .0, 1.)},
            u_time_since_click: {value: 0},
        },
        alphaTest: false,
        transparent: true
    });

    globe = new THREE.Points(globeGeometry, mapMaterial);
    scene.add(globe);

    globeMesh = new THREE.Mesh(globeGeometry, new THREE.MeshBasicMaterial({
        color: 0x222222,
        transparent: true,
        opacity: .01
    }));
    scene.add(globeMesh);
}

function createPointer() {
    const geometry = new THREE.SphereGeometry(.04, 16, 16);
    const material = new THREE.MeshBasicMaterial({
        color: 0x00000,
        transparent: true,
        opacity: 0
    });
    pointer = new THREE.Mesh(geometry, material);
    scene.add(pointer);
}


function updateOverlayGraphic() {
    let activePointPosition = pointer.position.clone();
    activePointPosition.applyMatrix4(globe.matrixWorld);
    const activePointPositionProjected = activePointPosition.clone();
    activePointPositionProjected.project(camera);
    coordinates2D[0] = (activePointPositionProjected.x + 1) * containerEl.offsetWidth * .5;
    coordinates2D[1] = (1 - activePointPositionProjected.y) * containerEl.offsetHeight * .5;

    const matrixWorldInverse = controls.object.matrixWorldInverse;
    activePointPosition.applyMatrix4(matrixWorldInverse);

    if (activePointPosition.z > -1) {
        if (popupVisible === false) {
            popupVisible = true;
            showPopupAnimation(false);
        }

        let popupX = coordinates2D[0];
        popupX -= (activePointPositionProjected.x * containerEl.offsetWidth * .3);

        let popupY = coordinates2D[1];
        const upDown = (activePointPositionProjected.y > .6);
        popupY += (upDown ? 20 : -20);

        gsap.set(popupEl, {
            x: popupX,
            y: popupY,
            xPercent: -35,
            yPercent: upDown ? 0 : -100
        });

        popupY += (upDown ? -5 : 5);
        const curveMidX = popupX + activePointPositionProjected.x * 100;
        const curveMidY = popupY + (upDown ? -.5 : .1) * coordinates2D[1];

        drawPopupConnector(coordinates2D[0], coordinates2D[1], curveMidX, curveMidY, popupX, popupY);

    } else {
        if (popupVisible) {
            popupOpenTl.pause(0);
            popupCloseTl.play(0);
        }
        popupVisible = false;
    }
}

function addCanvasEvents() {
    containerEl.addEventListener("mousemove", (e) => {
        updateMousePosition(e.clientX, e.clientY);
    });

    containerEl.addEventListener("click", (e) => {
        if (!dragged) {
            updateMousePosition(
                e.targetTouches ? e.targetTouches[0].pageX : e.clientX,
                e.targetTouches ? e.targetTouches[0].pageY : e.clientY,
            );

            const res = checkIntersects();
            if (res.length) {
                pointerPos = res[0].face.normal.clone();
                pointer.position.set(res[0].face.normal.x, res[0].face.normal.y, res[0].face.normal.z);
                mapMaterial.uniforms.u_pointer.value = res[0].face.normal;
                popupEl.innerHTML = cartesianToLatLong();
                showPopupAnimation(true);
                clock.start()
            }
        }
    });

    function updateMousePosition(eX, eY) {
        mouse.x = (eX - containerEl.offsetLeft) / containerEl.offsetWidth * 2 - 1;
        mouse.y = -((eY - containerEl.offsetTop) / containerEl.offsetHeight) * 2 + 1;
    }
}

function checkIntersects() {
    rayCaster.setFromCamera(mouse, camera);
    const intersects = rayCaster.intersectObject(globeMesh);
    if (intersects.length) {
        document.body.style.cursor = "pointer";
    } else {
        document.body.style.cursor = "auto";
    }
    return intersects;
}

function render() {
    mapMaterial.uniforms.u_time_since_click.value = clock.getElapsedTime();
    checkIntersects();
    if (pointer) {
        updateOverlayGraphic();
    }
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(render);
}

function updateSize() {
    const minSide = .65 * Math.min(window.innerWidth, window.innerHeight);
    containerEl.style.width = minSide + "px";
    containerEl.style.height = minSide + "px";
    renderer.setSize(minSide, minSide);
    canvas2D.width = canvas2D.height = minSide;
    mapMaterial.uniforms.u_dot_size.value = .04 * minSide;
}


//  ---------------------------------------
//  HELPERS

// popup content
function cartesianToLatLong() {
    const pos = pointer.position;
    const lat = 90 - Math.acos(pos.y) * 180 / Math.PI;
    const lng = (270 + Math.atan2(pos.x, pos.z) * 180 / Math.PI) % 360 - 180;
    return formatCoordinate(lat, 'N', 'S') + ",&nbsp;" + formatCoordinate(lng, 'E', 'W');
}

function formatCoordinate(coordinate, positiveDirection, negativeDirection) {
    const direction = coordinate >= 0 ? positiveDirection : negativeDirection;
    return `${Math.abs(coordinate).toFixed(4)}°&nbsp${direction}`;
}


// popup show / hide logic
function createPopupTimelines() {
    popupOpenTl = gsap.timeline({
        paused: true
    })
        .to(pointer.material, {
            duration: .2,
            opacity: 1,
        }, 0)
        .fromTo(canvas2D, {
            opacity: 0
        }, {
            duration: .3,
            opacity: 1
        }, .15)
        .fromTo(popupEl, {
            opacity: 0,
            scale: .9,
            transformOrigin: "center bottom"
        }, {
            duration: .1,
            opacity: 1,
            scale: 1,
        }, .15 + .1);

    popupCloseTl = gsap.timeline({
        paused: true
    })
        .to(pointer.material, {
            duration: .3,
            opacity: .2,
        }, 0)
        .to(canvas2D, {
            duration: .3,
            opacity: 0
        }, 0)
        .to(popupEl, {
            duration: 0.3,
            opacity: 0,
            scale: 0.9,
            transformOrigin: "center bottom"
        }, 0);
}

function showPopupAnimation(lifted) {
    if (lifted) {
        let positionLifted = pointer.position.clone();
        positionLifted.multiplyScalar(1.3);
        gsap.from(pointer.position, {
            duration: .25,
            x: positionLifted.x,
            y: positionLifted.y,
            z: positionLifted.z,
            ease: "power3.out"
        });
    }
    popupCloseTl.pause(0);
    popupOpenTl.play(0);
}


// overlay (line between pointer and popup)
function drawPopupConnector(startX, startY, midX, midY, endX, endY) {
    overlayCtx.strokeStyle = "#00ffb2";
    overlayCtx.lineWidth = 3;
    overlayCtx.lineCap = "round";
    overlayCtx.clearRect(0, 0, containerEl.offsetWidth, containerEl.offsetHeight);
    overlayCtx.beginPath();
    overlayCtx.moveTo(startX, startY);
    overlayCtx.quadraticCurveTo(midX, midY, endX, endY);
    overlayCtx.stroke();
}

connectWebSocket();

    function connectWebSocket() {
        const ws = new WebSocket('wss://feed.telemetry.polkadot.io/feed');
        ws.onmessage = function(event) {
if (event.data instanceof Blob) {
        // Use FileReader to read the blob as text
        const reader = new FileReader();
        reader.onload = function() {
        try { 
			                  const data = JSON.parse(reader.result);
 
    
			  if (data.length > 5 && data[5].length > 6) {
                    const coordinates = data[5][6]; // Assuming this is an array [lat, long]
                    if (coordinates.length >= 2) {
                        const latitude = coordinates[0];
							  console.log(latitude)
                        const longitude = coordinates[1];
                        // Call function to update globe with this location	createMarkerWithPopup(latitude, longitude, markerData);
							  console.log(longitude)

                        // For example:
                        updateFromWebSocketData(latitude, longitude);

                        // Assuming you have a mechanism to convert lat/long to screen positions for the popup
                        // This would be more complex and depends on your globe visualization
                        // positionAndTogglePopupBasedOnGlobeCoordinates(latitude, longitude);
                    }
                }
                // Process your JSON data here
            } catch (error) {
                console.error("Error parsing JSON:", error);
            }
        };
	    ws.send(`subscribe:0x05d5279c52c484cc80396535a316add7d47b1c5b9e0398dd1f584149341460c5`) 
	ws.send(`send-finality:0x05d5279c52c484cc80396535a316add7d47b1c5b9e0398dd1f584149341460c5`)
        reader.onerror = function(error) {
            console.error("Error reading the blob as text:", error);
        };
        reader.readAsText(event.data);
    } else {
        // Handle non-Blob messages normally
        try {
            const data = JSON.parse(event.data);
			                      console.log('Parsed data:', data);

			   extractLocationData(data);
			  const locations = parseWebSocketData(data);
			  locations.forEach(location => {
                console.log(`Location: ${location.locationName}, Latitude: ${location.latitude}, Longitude: ${location.longitude}`);
                // Update globe with the location data
                // This function needs to be implemented based on your visualization requirements
                updateGlobeWithLocation(location.latitude, location.longitude, location.locationName);
            });
            // Process your JSON data here
        } catch (error) {
            console.error("Error parsing JSON:", error);
        }
    }            
            
        };
    }
function extractLocationData(data) {
    // Initialize an array to hold extracted location data
    let locationData = [];

    // Loop through the data array
    for (let i = 0; i < data.length; i++) {
        // Check if the current element is an array with three elements
        // where the first two elements are numbers (latitude and longitude)
        // and the third element is a string (location name)
        let item = data[i];
        if (Array.isArray(item) && item.length === 3 && typeof item[0] === 'number' && typeof item[1] === 'number' && typeof item[2] === 'string') {
            // Extract latitude, longitude, and location name
            let [latitude, longitude, locationName] = item;

            // Add the extracted data to the locationData array
            locationData.push({ latitude, longitude, locationName });
        }
    }
console.log(locationData)
    // Return the extracted location data
    return locationData;
}
function parseWebSocketData(data) {
    // Initialize an empty array to hold the extracted location data
    let locations = [];

    // Iterate through the main array
    for (let i = 0; i < data.length; i++) {
        // Check for the structure that contains the location information
        // Assuming this structure is an array with 3 elements: [latitude, longitude, "Location Name"]
        if (Array.isArray(data[i]) && data[i].length === 3 && typeof data[i][0] === "number" && typeof data[i][1] === "number" && typeof data[i][2] === "string") {
            // Extract the latitude, longitude, and location name
            const [latitude, longitude, locationName] = data[i];

            // Add the extracted information to the locations array
            locations.push({ latitude, longitude, locationName });
        }
    }

    // Return the array of locations
    return locations;
}

// Assuming WebSocket messages provide latitude and longitude coordinates
function updateFromWebSocketData(latitude, longitude) {
    // Example function to update the globe and popup based on coordinates
    updateGlobeWithLocation(latitude, longitude);
    positionAndTogglePopupBasedOnGlobeCoordinates(latitude, longitude);
}

function positionAndTogglePopupBasedOnGlobeCoordinates(latitude, longitude) {
    // Convert lat/long to vector3 for positioning on the globe if necessary
    // This step depends on your globe's implementation details

    // For demonstration, directly use these as placeholder for positioning logic
    const x = latitude; // Placeholder conversion
    const y = longitude; // Placeholder conversion

    positionAndTogglePopup(x, y);
}

function positionAndTogglePopup(x, y) {
    const popup = document.querySelector('.globe-popup');
    // Assuming x and y are now screen positions, adjust as necessary
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    popup.style.opacity = popup.style.opacity === '1' ? '0' : '1';
}

function updateGlobeWithLocation(latitude, longitude) {
    const globeRadius = 1; // Adjust based on your globe's actual radius
    const position = latLongToVector3(latitude, longitude, globeRadius + 0.01);

    // Create a new marker for each location
    const markerGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const newMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    newMarker.position.copy(position);
    scene.add(newMarker);

    // Optionally, save the new marker to local storage for persistence
    saveMarkerToLocalStorage(latitude, longitude);

    // Update the popup position if necessary
    updatePopupPositionAndShow(latitude, longitude);
}
document.addEventListener('DOMContentLoaded', function() {
    initScene();
    loadMarkersFromLocalStorage(); // This will load and display all saved markers
    window.addEventListener("resize", updateSize);
});
function saveMarkerToLocalStorage(latitude, longitude) {
    // Retrieve existing markers from local storage
    let markers = JSON.parse(localStorage.getItem('markers')) || [];
    markers.push({ latitude, longitude });
    localStorage.setItem('markers', JSON.stringify(markers));
}


function loadMarkersFromLocalStorage() {
    let markers = JSON.parse(localStorage.getItem('markers')) || [];
    markers.forEach(marker => {
        updateGlobeWithLocation(marker.latitude, marker.longitude);
    });
}
document.addEventListener('DOMContentLoaded', function() {
    initScene();
    initMarker(); // Make sure this function exists and adds a marker to the scene
    loadMarkersFromLocalStorage(); // Load any saved markers
    window.addEventListener("resize", updateSize);
});

function initMarker() {
    if (!window.marker) { // Check if the marker doesn't already exist
        const markerGeometry = new THREE.SphereGeometry(0.02, 16, 16); // Small sphere as marker
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red color
        window.marker = new THREE.Mesh(markerGeometry, markerMaterial);
        scene.add(window.marker);
        window.marker.visible = false; // Initially hide the marker
    }
}

function updatePopupPositionAndShow(latitude, longitude) {
    if (typeof latitude === 'number' && typeof longitude === 'number') {

    // Convert 3D position to screen coordinates
    const vector = window.marker.position.clone().project(camera);
    const x = (vector.x * 0.5 + 0.5) * containerEl.clientWidth;
    const y = (vector.y * -0.5 + 0.5) * containerEl.clientHeight;

    popupEl.innerHTML = `Latitude: ${latitude.toFixed(4)}, Longitude: ${longitude.toFixed(4)}`;
        popupEl.style.left = `${x}px`;
        popupEl.style.top = `${y}px`;
        popupEl.style.display = 'block'; // Show the popup
}else {
        console.error('Latitude or longitude is undefined.');
    }
}
function latLongToVector3(latitude, longitude, radius) {
    const phi = (90 - latitude) * (Math.PI / 180);
    const theta = (longitude + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    return new THREE.Vector3(x, y, z);
}
	

window.addEventListener("resize", updateSize);
function createMarkerWithPopup(latitude, longitude, markerData) {
    const globeRadius = 1; // Adjust based on your globe's actual radius
    const position = latLongToVector3(latitude, longitude, globeRadius + 0.01);

    // Create marker
    const markerGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(position);
    scene.add(marker);

    // Create popup for this marker
    const popup = document.createElement('div');
    popup.className = 'globe-popup';
    popup.innerHTML = `Latitude: ${latitude.toFixed(4)}, Longitude: ${longitude.toFixed(4)}<br>${markerData}`;
    document.body.appendChild(popup);

    // Position popup initially (will be updated on render/update)
    updatePopupPosition(popup, marker);

    // Save marker and popup for later updates
    markers.push({ marker, popup });

    // Optionally, save the new marker to local storage for persistence
    saveMarkerToLocalStorage(latitude, longitude, markerData);
}
function updatePopupPositions() {
    markers.forEach(({ marker, popup }) => {
        updatePopupPosition(popup, marker);
    });
}

function updatePopupPosition(popup, marker) {
    const vector = marker.position.clone().project(camera);
    const x = (vector.x * .5 + .5) * containerEl.clientWidth;
    const y = (vector.y * -.5 + .5) * containerEl.clientHeight;

    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
}