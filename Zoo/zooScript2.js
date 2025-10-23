const FEED_COOLDOWN = 30000; // 30 seconds between feedings per animal
const SPRINKLER_DURATION_MS = 10000; // how long sprinklers run when activated by schedule (10 seconds)

const feedingHistory = {}; // { animalId: Date }
const feedTimers = new Map(); // buttonId -> { t1, t2 }
const sprinklerSchedules = new Map(); // zoneId -> { time: "HH:MM", timeoutId }
const sprinklerActiveTimeouts = new Map(); // zoneId -> timeout id for currently active sprinkler
const sprinklerAudios = new Map(); // zoneId -> Audio object for sprinkler sound

// remember last HH:MM we triggered each zone so we don't retrigger repeatedly while the same minute matches
const sprinklerLastTriggered = new Map();

function formatTime(date) {
    return date.toLocaleString([], { hour: '2-digit', minute: '2-digit', weekday: 'short' });
}

// Update clock every 5 seconds
setInterval(() => {
    const clock = document.getElementById("time");
    if (clock) clock.textContent = formatTime(new Date());
}, 5000);


// locks
function setEnclosureLock(enclosureId, isLocked) {
    const enclosure = document.getElementById(enclosureId);
    if (!enclosure) return;
    enclosure.classList.toggle("locked", isLocked);
    enclosure.classList.toggle("unlocked", !isLocked);

    //play lock/unlock sound
    const audio = new Audio(isLocked ? 'door-lock-98655.mp3' : 'key-twist-in-lock-47832.mp3');
    audio.play();

    // Update heading lock icon (keep a single element)
    const h3 = enclosure.querySelector("h3");
    if (h3) {
        let icon = h3.querySelector(".lockIcon");
        if (!icon) {
            icon = document.createElement("span");
            icon.className = "lockIcon";
            h3.appendChild(icon);
        }
        icon.textContent = isLocked ? "🔒" : "🔓";
    }

    const allLockBtn = document.getElementById("lockAll");
    const allUnlockBtn = document.getElementById("unlockAll");
    if (allLockBtn) allLockBtn.disabled = false;
    if (allLockBtn) allLockBtn.style.cursor = "pointer";
    if (allLockBtn) allLockBtn.style.backgroundColor = "#FF8A70";
    if (allUnlockBtn) allUnlockBtn.style.backgroundColor = "#70C637";
    if (allUnlockBtn) allUnlockBtn.disabled = false;
    if (allUnlockBtn) allUnlockBtn.style.cursor = "pointer";
}

const allLockBtn = document.getElementById("lockAll");
const allUnlockBtn = document.getElementById("unlockAll");

const zones = [
    { zoneLock: "zone1LockAll", animals: ["lion","elephant","giraffe","rhino"] },
    { zoneLock: "zone2LockAll", animals: ["penguin","bear","hippo","otter"] },
    { zoneLock: "zone3LockAll", animals: ["kangaroo","capybara","emu","monkey"] }
];

if (allLockBtn) {
    allLockBtn.addEventListener("click", () => {
        const proceed = confirm("Are you sure you want to lock all enclosures?");
        if (!proceed) return;
        zones.forEach(zone => {
            const zoneCb = document.getElementById(zone.zoneLock);
            if (zoneCb) zoneCb.checked = true;
            zone.animals.forEach(a => {
                const cb = document.getElementById(a + "Lock");
                if (cb) cb.checked = true;
                setEnclosureLock(a, true);
            });
        });
        //disable lock all button until something is unlocked
        allLockBtn.disabled = true;
        allLockBtn.style.cursor = "not-allowed";
        allLockBtn.style.backgroundColor = "#888";
        if (allUnlockBtn) allUnlockBtn.style.backgroundColor = "#70C637";
        if (allUnlockBtn) allUnlockBtn.style.cursor = "pointer";
        if (allUnlockBtn) allUnlockBtn.disabled = false;
    });
}

if (allUnlockBtn) {
    allUnlockBtn.addEventListener("click", () => {
        const proceed = confirm("Are you sure you want to unlock all enclosures?");
        if (!proceed) return;
        zones.forEach(zone => {
            const zoneCb = document.getElementById(zone.zoneLock);
            if (zoneCb) zoneCb.checked = false;
            zone.animals.forEach(a => {
                const cb = document.getElementById(a + "Lock");
                if (cb) cb.checked = false;
                setEnclosureLock(a, false);
            });
        });
        //disable unlock all button until something is locked
        allUnlockBtn.disabled = true;
        allUnlockBtn.style.cursor = "not-allowed";
        allUnlockBtn.style.backgroundColor = "#888";
        if (allLockBtn) allLockBtn.style.backgroundColor = "#FF8A70";
        if (allLockBtn) allLockBtn.style.cursor = "pointer";
        if (allLockBtn) allLockBtn.disabled = false;
    });
}

// per-zone and per-animal locks
zones.forEach(zone => {
    const zoneCheckbox = document.getElementById(zone.zoneLock);
    if (!zoneCheckbox) return;

    zoneCheckbox.addEventListener("change", () => {
        zone.animals.forEach(animal => {
            const animalCb = document.getElementById(animal + "Lock");
            if (animalCb) animalCb.checked = zoneCheckbox.checked;
            setEnclosureLock(animal, zoneCheckbox.checked);
            // If all locked, disable lock all button
            if (zoneCheckbox.checked && allLockBtn) {
                const allLocked = Array.from(document.querySelectorAll(".animal.enclosure")).every(e => e.classList.contains("locked"));
                if (allLocked) {
                    allLockBtn.disabled = true;
                    allLockBtn.style.cursor = "not-allowed";
                    allLockBtn.style.backgroundColor = "#888";
                }
            }
            // If all unlocked, disable unlock all button
            if (!zoneCheckbox.checked && allUnlockBtn) {
                const anyLocked = Array.from(document.querySelectorAll(".animal.enclosure")).some(e => e.classList.contains("locked"));
                if (!anyLocked) {
                    allUnlockBtn.disabled = true;
                    allUnlockBtn.style.cursor = "not-allowed";
                    allUnlockBtn.style.backgroundColor = "#888";
                }
            }
        });
    });

    zone.animals.forEach(animal => {
        const animalCheckbox = document.getElementById(animal + "Lock");
        if (!animalCheckbox) return;

        animalCheckbox.addEventListener("change", () => {
            setEnclosureLock(animal, animalCheckbox.checked);

            // If any animal is unlocked, uncheck zone lock
            if (!animalCheckbox.checked) zoneCheckbox.checked = false;

            // If all animals locked, zone lock = checked
            if (zone.animals.every(a => document.getElementById(a + "Lock") && document.getElementById(a + "Lock").checked)) {
                zoneCheckbox.checked = true;
            }

            // If all locked, disable lock all button
            if (animalCheckbox.checked && allLockBtn) {
                const allLocked = Array.from(document.querySelectorAll(".animal.enclosure")).every(e => e.classList.contains("locked"));
                if (allLocked) {
                    allLockBtn.disabled = true;
                    allLockBtn.style.cursor = "not-allowed";
                    allLockBtn.style.backgroundColor = "#888";
                }
            }
            // If all unlocked, disable unlock all button
            if (!animalCheckbox.checked && allUnlockBtn) {
                const anyLocked = Array.from(document.querySelectorAll(".animal.enclosure")).some(e => e.classList.contains("locked"));
                if (!anyLocked) {
                    allUnlockBtn.disabled = true;
                    allUnlockBtn.style.cursor = "not-allowed";
                    allUnlockBtn.style.backgroundColor = "#888";
                }
            }
        });
    });
});

// sprinkler system
const allSprinklers = document.getElementById("allSprinklers");
const sprinklerZoneIds = ["zone1Sprinkler","zone2Sprinkler","zone3Sprinkler"];

// update visual state of a zone's sprinkler
function updateZoneSprinklerVisual(zoneId, isOn) {
    const zoneContainerId = zoneId.replace("Sprinkler", ""); 
    const zoneElem = document.getElementById(zoneContainerId);
    if (!zoneElem) return;

    zoneElem.dataset.sprinklerOn = isOn ? "1" : "0";

    let audio = sprinklerAudios.get(zoneContainerId);
    if(!audio && isOn){
        audio = new Audio('sprinkler-93592.mp3');
        audio.loop = true;
        audio.preload = "auto";
        sprinklerAudios.set(zoneContainerId, audio);
    }

    //Add/remove blue border by toggling class
    if (isOn) {
        zoneElem.classList.add("sprinkling");
        //play sound
        if(audio){
            audio.currentTime = 0;
            audio.play().catch(()=>{}); //catch to avoid unhandled promise if user hasn't interacted yet
        }
    } else {
        //stop sound if playing
        if(audio){
            audio.pause();
            audio.currentTime = 0;
            sprinklerAudios.delete(zoneContainerId);
        }
        zoneElem.classList.remove("sprinkling");
    }
}

// All Sprinklers toggle
allSprinklers.addEventListener("change", () => {
    sprinklerZoneIds.forEach(id => {
        const checkbox = document.getElementById(id);
        checkbox.checked = allSprinklers.checked;
        updateZoneSprinklerVisual(id, allSprinklers.checked);
        //ensure all timeout after 10 seconds
        if (allSprinklers.checked) {
            const zone = id.replace("Sprinkler", "");
            if (sprinklerActiveTimeouts.has(zone)) {
                clearTimeout(sprinklerActiveTimeouts.get(zone));
            }
            const to = setTimeout(() => {
                checkbox.checked = false;
                updateZoneSprinklerVisual(id, false);
                sprinklerActiveTimeouts.delete(zone);
                // Sync master switch
                allSprinklers.checked = sprinklerZoneIds.every(z => document.getElementById(z).checked);
            }, SPRINKLER_DURATION_MS);
            sprinklerActiveTimeouts.set(zone, to);
        } else {
            // If turning off early, clear any timers
            const zone = id.replace("Sprinkler", "");
            if (sprinklerActiveTimeouts.has(zone)) {
                clearTimeout(sprinklerActiveTimeouts.get(zone));
                sprinklerActiveTimeouts.delete(zone);
            }
        }
    });
});

// Individual sprinkler controls
sprinklerZoneIds.forEach(id => {
    const checkbox = document.getElementById(id);
    checkbox.addEventListener("change", () => {
        updateZoneSprinklerVisual(id, checkbox.checked);

        // auto turn OFF after timeout
        if (checkbox.checked) {
            const zone = id.replace("Sprinkler", "");

            // Clear any existing timeout
            if (sprinklerActiveTimeouts.has(zone)) {
                clearTimeout(sprinklerActiveTimeouts.get(zone));
            }

            const to = setTimeout(() => {
                checkbox.checked = false;
                updateZoneSprinklerVisual(id, false);
                sprinklerActiveTimeouts.delete(zone);

                // Sync master switch
                allSprinklers.checked = sprinklerZoneIds.every(z => document.getElementById(z).checked);
            }, SPRINKLER_DURATION_MS);

            sprinklerActiveTimeouts.set(zone, to);
        } else {
            // If manually turned off early, cancel any timer
            const zone = id.replace("Sprinkler", "");
            if (sprinklerActiveTimeouts.has(zone)) {
                clearTimeout(sprinklerActiveTimeouts.get(zone));
                sprinklerActiveTimeouts.delete(zone);
            }
        }

        // Keep master switch synced
        allSprinklers.checked = sprinklerZoneIds.every(z => document.getElementById(z).checked);
    });
});

function timeFormat(timeInput){
    // return HH:MM am/pm format from "HH:MM" 24h input
    const [hh, mm] = timeInput.split(":").map(Number);
    const ampm = hh >= 12 ? "PM" : "AM";
    const hh12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${String(hh12).padStart(2,"0")}:${String(mm).padStart(2,"0")} ${ampm}`;
}


// Sprinkler scheduling (supports multiple times per zone)
function updateScheduleDisplay(zone) {
    const display = document.getElementById(zone + "Schedule");
    const set = sprinklerSchedules.get(zone);
    if (!display) return;
    if (!set || set.size === 0) {
        display.textContent = "None Scheduled";
        return;
    }
    display.textContent = "Scheduled: " + Array.from(set).sort().map(t => timeFormat(t)).join(", ");
}

["zone1","zone2","zone3"].forEach(zone => {
    const setBtn = document.getElementById(zone + "SetSchedule");
    const clearBtn = document.getElementById(zone + "ClearSchedule");
    const timeInput = document.getElementById(zone + "ScheduleTime");

    if (setBtn && timeInput) {
        setBtn.addEventListener("click", () => {
            const timeVal = timeInput.value;
            if (!timeVal) { alert("Please pick a time first."); return; }
            let set = sprinklerSchedules.get(zone);
            if (!set) {
                set = new Set();
                sprinklerSchedules.set(zone, set);
            }
            if (set.has(timeVal)) {
                alert(`${timeFormat(timeVal)} is already scheduled for ${zone}.`);
            } else {
                set.add(timeVal);
                updateScheduleDisplay(zone);
                alert(`${zone} sprinkler scheduled for ${timeFormat(timeVal)} daily.`);
            }
            timeInput.value = ""; // clear input
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            sprinklerSchedules.delete(zone);
            updateScheduleDisplay(zone);
            alert(`${zone} sprinkler schedule cleared.`);
        });
    }

    // initialize display on boot if needed
    updateScheduleDisplay(zone);
});

// check schedules every 10 seconds and trigger sprinklers when match
setInterval(() => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentHM = `${hh}:${mm}`;

    sprinklerSchedules.forEach((setOfTimes, zone) => {
        if (!setOfTimes || !setOfTimes.has(currentHM)) {
            // clear last-trigger marker when minute no longer matches so next day/minute can retrigger
            const last = sprinklerLastTriggered.get(zone);
            if (last && last !== currentHM) sprinklerLastTriggered.delete(zone);
            return;
        }

        // only trigger once per matching minute
        if (sprinklerLastTriggered.get(zone) === currentHM) return;
        sprinklerLastTriggered.set(zone, currentHM);

        // Activate the sprinkler for this zone
        const checkbox = document.getElementById(zone + "Sprinkler");
        if (checkbox) {
            checkbox.checked = true;
            updateZoneSprinklerVisual(zone + "Sprinkler", true);
            // schedule off after duration (clear any previous timeout first)
            if (sprinklerActiveTimeouts.has(zone)) {
                clearTimeout(sprinklerActiveTimeouts.get(zone));
            }
            const to = setTimeout(() => {
                const cb = document.getElementById(zone + "Sprinkler");
                if (cb) {
                    cb.checked = false;
                    updateZoneSprinklerVisual(zone + "Sprinkler", false);
                }
                sprinklerActiveTimeouts.delete(zone);
            }, SPRINKLER_DURATION_MS);
            sprinklerActiveTimeouts.set(zone, to);
        }
    });
}, 1000);

// feeding system
const FEED_WARNING_MS = 30000; // 30s until warning appears
const warningTimeouts = new Map();     // per-animal warning timeouts

// Ensure last-fed stamps exist (creates the element if missing)
function updateLastFedDisplay(animalId, date) {
    const enclosure = document.getElementById(animalId);
    if (!enclosure) return;
    let stamp = enclosure.querySelector(".lastFedStamp");
    if (!stamp) {
        stamp = document.createElement("div");
        stamp.className = "lastFedStamp";
        enclosure.appendChild(stamp);
    }
    stamp.textContent = `Last fed: ${formatTime(date)}`;
}

// Remove any warning marker for an animal
function clearWarning(animalId) {
    const enclosure = document.getElementById(animalId);
    if (!enclosure) return;
    const stamp = enclosure.querySelector(".lastFedStamp");
    if (!stamp) return;
    // remove warning substring if present
    stamp.textContent = stamp.textContent.replace(/⚠️ .*needs feeding!?/g, '').trim();
}

// Add a warning marker to the lastFedStamp (keeps timestamp if present)
function addWarning(animalId) {
    const enclosure = document.getElementById(animalId);
    if (!enclosure) return;
    let stamp = enclosure.querySelector(".lastFedStamp");
    if (!stamp) {
        stamp = document.createElement("div");
        stamp.className = "lastFedStamp";
        enclosure.appendChild(stamp);
    }
    // keep existing text then append warning
    const base = stamp.textContent ? stamp.textContent + ' ' : '';
    stamp.textContent = `${base}⚠️ ${animalId.charAt(0).toUpperCase() + animalId.slice(1)} needs feeding!`;
    // Play alert sound
    const audio = new Audio('notification-alert-ii-379999.mp3');
    audio.play();
}

// Set feed button visual states in control panel and modal
function setFeedState(button, state) {
    if (!button) return;
    button.classList.remove('fed-green','fed-yellow','fed-red');
    button.disabled = false;

    if (state === 'green') {
        button.classList.add('fed-green');
        button.textContent = 'Fed!';
        button.disabled = true;
        button.style.cursor = "not-allowed";
        updateModal();
    } else if (state === 'yellow') {
        button.classList.add('fed-yellow');
        button.textContent = 'Feed';
        button.disabled = false;
        button.style.cursor = "pointer";
        updateModal();
        
    } else if (state === 'red') {
        button.classList.add('fed-red');
        button.textContent = 'Feed!';
        button.disabled = false;
        button.style.cursor = "pointer";
        updateModal();
    }
    //sync feed all button for zone
    const animal = (button.id || button.dataset.feedId || '').replace(/Feed$/i, '');
    zones.forEach(zone => {
        if (zone.animals.includes(animal)) {
            const zoneFeedBtn = document.getElementById(zone.zoneLock.replace("LockAll","Feed"));
            if (zoneFeedBtn) {
                const anyNeedsFeeding = zone.animals.some(a => {
                    const b = document.getElementById(a + "Feed");
                    return b && b.classList.contains('fed-red') && !b.disabled;
                });
                zoneFeedBtn.disabled = !anyNeedsFeeding;
                zoneFeedBtn.style.cursor = anyNeedsFeeding ? "pointer" : "not-allowed";
                zoneFeedBtn.style.backgroundColor = anyNeedsFeeding ? "#FF8A70" : "#70C637";
            }
        }
    });
    //sync master feed all button
    const feedAllBtn = document.getElementById("feedAll");
    if (feedAllBtn) {
        const anyNeedsFeeding = Array.from(document.querySelectorAll(".feed")).some(b => b && b.classList.contains('fed-red') && !b.disabled);
        feedAllBtn.disabled = !anyNeedsFeeding;
        feedAllBtn.style.cursor = anyNeedsFeeding ? "pointer" : "not-allowed";
        feedAllBtn.style.backgroundColor = anyNeedsFeeding ? "#FF8A70" : "#70C637";
    }
}

// Cancel scheduled transitions for a feed button
function clearFeedTimers(button) {
    const id = button.dataset.feedId || button.id;
    if (!id) return;
    const entry = feedTimers.get(id);
    if (entry) {
        clearTimeout(entry.t1);
        clearTimeout(entry.t2);
        feedTimers.delete(id);
    }
}

// Schedule automatic visual transitions for feed button:
// yellow after 15s, red + warning after 30s
function scheduleFeedTransitions(button, animalId) {
    const id = button.dataset.feedId || button.id;

    const t1 = setTimeout(() => {
        setFeedState(button, 'yellow');
    }, 15000);

    const t2 = setTimeout(() => {
        setFeedState(button, 'red');
        addWarning(animalId);
    }, FEED_WARNING_MS); // 30s warn

    feedTimers.set(id, { t1, t2 });
}

// Attach handlers to each feed button
document.querySelectorAll(".feed").forEach(button => {
    if (!button.dataset.feedId && button.id) button.dataset.feedId = button.id;

    button.addEventListener("click", () => {
        const animal = (button.id || button.dataset.feedId || '').replace(/Feed$/i, '');
        if (!animal) return;

        // Prevent double actions if button disabled by green state
        if (button.disabled) return;

        // Cooldown check
        const last = feedingHistory[animal];
        const now = Date.now();
        if (last && (now - last.getTime()) < FEED_COOLDOWN) {
            const remaining = Math.ceil((FEED_COOLDOWN - (now - last.getTime())) / 1000);
            alert(`${animal.charAt(0).toUpperCase() + animal.slice(1)} was fed recently. Wait ${remaining}s.`);
            return;
        }

        // Clear any previous timers & warnings
        clearFeedTimers(button);
        if (warningTimeouts.has(animal)) {
            clearTimeout(warningTimeouts.get(animal));
            warningTimeouts.delete(animal);
        }
        clearWarning(animal);

        // Record feeding
        feedingHistory[animal] = new Date();
        updateLastFedDisplay(animal, feedingHistory[animal]);

        // Visual feedback: set green & schedule transitions
        setFeedState(button, 'green');
        scheduleFeedTransitions(button, animal);
    });
});

// Feed All button
const feedAllBtn = document.getElementById("feedAll");
if (feedAllBtn) {
    feedAllBtn.addEventListener("click", () => {
        const proceed = confirm("Are you sure you want to feed all animals?");
        if (!proceed) return;
        document.querySelectorAll(".feed").forEach(button => {
            if (!button.disabled) button.click();
        });
    });
}

// Zone-level feed-all wiring
function setupZoneFeedAll(zoneFeedButtonId, animalIds) {
    const feedAllBtnLocal = document.getElementById(zoneFeedButtonId);
    if (!feedAllBtnLocal) return;

    feedAllBtnLocal.addEventListener("click", () => {
        animalIds.forEach(animal => {
            const feedButton = document.getElementById(animal + "Feed");
            if (feedButton && !feedButton.disabled) feedButton.click();
        });
    });
}

setupZoneFeedAll("zone1Feed", ["lion", "elephant", "giraffe", "rhino"]);
setupZoneFeedAll("zone2Feed", ["penguin", "bear", "hippo", "otter"]);
setupZoneFeedAll("zone3Feed", ["kangaroo", "capybara", "emu", "monkey"]);

// enclosure modal
const modal = document.getElementById("enclosureModal");
const modalTitle = document.getElementById("modalTitle");
const modalLastFed = document.getElementById("modalLastFed");
const modalLockStatus = document.getElementById("modalLockStatus");
const modalFeedBtn = document.getElementById("modalFeedBtn");
const modalLockBtn = document.getElementById("modalLockBtn");
const closeModal = document.getElementById("closeModal");

let currentAnimal = null;

document.querySelectorAll(".animal.enclosure").forEach(enclosure => {
    enclosure.addEventListener("click", (e) => {
        currentAnimal = enclosure.id;
        updateModal();
        if (modal) modal.classList.remove("hidden");
    });
});

function updateModal() {
    if (!currentAnimal) return;
    const enclosure = document.getElementById(currentAnimal);
    const lastFed = feedingHistory[currentAnimal];
    const isLocked = enclosure.classList.contains("locked");

    if (modalTitle) modalTitle.textContent = currentAnimal.charAt(0).toUpperCase() + currentAnimal.slice(1);
    if (modalLastFed) modalLastFed.textContent = lastFed ? `Last fed: ${formatTime(lastFed)}` : `Not fed yet!`;
    if (modalLockStatus) modalLockStatus.textContent = isLocked ? "🔒 Locked" : "🔓 Unlocked";
    if (modalLockBtn) modalLockBtn.textContent = isLocked ? "Unlock" : "Lock";
    if (modalLockBtn) modalLockBtn.style.backgroundColor = isLocked ? "#70C637" : "#FF8A70";
    if (modalLockBtn) modalLockBtn.style.cursor = "pointer";

    const mainFeedBtn = document.getElementById(currentAnimal + "Feed");
    if (modalFeedBtn && mainFeedBtn) {
        modalFeedBtn.disabled = mainFeedBtn.disabled;
        modalFeedBtn.textContent = mainFeedBtn.textContent;
        modalFeedBtn.classList = mainFeedBtn.classList;
        modalFeedBtn.style.cursor = mainFeedBtn.disabled ? "not-allowed" : "pointer";
    }
}

if (modalFeedBtn) {
    modalFeedBtn.addEventListener("click", () => {
        if (!currentAnimal) return;
        const btn = document.getElementById(currentAnimal + "Feed");
        if (btn && !btn.disabled) btn.click();
        updateModal();
    });
}

if (modalLockBtn) {
    modalLockBtn.addEventListener("click", () => {
        if (!currentAnimal) return;
        const enclosure = document.getElementById(currentAnimal);
        const isLocked = enclosure.classList.contains("locked");
        setEnclosureLock(currentAnimal, !isLocked);
        const cb = document.getElementById(currentAnimal + "Lock");
        if (cb) cb.checked = !isLocked;
        updateModal();
        //if all in zone locked/unlocked, update zone checkbox
        zones.forEach(zone => {
            if (zone.animals.includes(currentAnimal)) {
                const zoneCb = document.getElementById(zone.zoneLock);
                if (zoneCb) {
                    const allLocked = zone.animals.every(a => {
                        const aCb = document.getElementById(a + "Lock");
                        return aCb && aCb.checked;
                    });
                    zoneCb.checked = allLocked;
                }
            }
        });
        // If all locked, disable lock all button
        if (!isLocked && allLockBtn) {
            const allLocked = Array.from(document.querySelectorAll(".animal.enclosure")).every(e => e.classList.contains("locked"));
            if (allLocked) {
                allLockBtn.disabled = true;
                allLockBtn.style.cursor = "not-allowed";
                allLockBtn.style.backgroundColor = "#888";
            }
        }
        // If all unlocked, disable unlock all button
        if (isLocked && allUnlockBtn) {
            const anyLocked = Array.from(document.querySelectorAll(".animal.enclosure")).some(e => e.classList.contains("locked"));
            if (!anyLocked) {
                allUnlockBtn.disabled = true;
                allUnlockBtn.style.cursor = "not-allowed";
                allUnlockBtn.style.backgroundColor = "#888";
            }
        }
    });
}

if (closeModal) {
    closeModal.addEventListener("click", () => {
        if (modal) modal.classList.add("hidden");
    });
}

// Close modal when clicking outside content
window.addEventListener("click", (event) => {
    if (modal && event.target === modal) modal.classList.add("hidden");
});

// -------------------- Boot: populate initial UI state --------------------
(function boot() {
    // ensure lock icons show correct initial state based on class
    document.querySelectorAll(".animal.enclosure").forEach(enclosure => {
        const id = enclosure.id;
        const locked = enclosure.classList.contains("locked");
        setEnclosureLock(id, locked);
        // initial last-fed stamp if feedingHistory already had entries (likely none)
        if (feedingHistory[id]) updateLastFedDisplay(id, feedingHistory[id]);
        // initialize clock to current time
        const clock = document.getElementById("time");
        if (clock) clock.textContent = formatTime(new Date());
        // disable unlock all if nothing locked
        if (allUnlockBtn) {
            const anyLocked = Array.from(document.querySelectorAll(".animal.enclosure")).some(e => e.classList.contains("locked"));
            allUnlockBtn.disabled = !anyLocked;
            allUnlockBtn.style.backgroundColor = anyLocked ? "#70C637" : "#888";
            allUnlockBtn.style.cursor = anyLocked ? "pointer" : "not-allowed";
        }
        // set all feed buttons to red state initially
        const feedButton = document.getElementById(id + "Feed");
        if (feedButton) setFeedState(feedButton, 'red');
        // set modal feed button state if applicable
        if (modalFeedBtn && feedButton) {
            modalFeedBtn.disabled = feedButton.disabled;
            modalFeedBtn.textContent = feedButton.textContent;
            modalFeedBtn.classList = feedButton.classList;
            modalFeedBtn.style.cursor = feedButton.disabled ? "not-allowed" : "pointer";
        }
        // add fed stamp for not fed recently
        if (!feedingHistory[id]) {
            addWarning(id);
        }
    });

    // sync master sprinklers checkbox
    if (allSprinklers) allSprinklers.checked = sprinklerZoneIds.every(z => document.getElementById(z) && document.getElementById(z).checked);
})();





