// --- 0. 맵 상수 정의 ---
// const MAP_WIDTH = 5;
// const MAP_HEIGHT = 5;

// --- 1. 맵 및 적 데이터 (추후 CSV 파일 내용을 바탕으로 채워질 예정) ---
const ENEMY_TEMPLATES = {
    // 예시: "goblin_scout": { name: "고블린 정찰병", type: "야수", maxHp: 30, ... skills: [SKILLS.SKILL_OVERTURE.id] },
};

const MAP_LOCATIONS = {
    // 예시: "forest_entrance": { name: "숲 입구", description: "...", enemies: ["goblin_scout"], connections: {"북쪽": "deep_forest"} },
};

// 현재는 5x5 그리드 맵을 사용하므로, 위 MAP_LOCATIONS는 추후 CSV 데이터 기반 맵 시스템으로 확장 시 사용됩니다.
// 지금은 캐릭터의 posX, posY를 직접 사용합니다.

// --- 2. 맵 렌더링 함수 ---
function renderMapGrid(mapContainerElement, allyChars, enemyChars) {
    if (!mapContainerElement) return;
    mapContainerElement.innerHTML = ''; // 기존 맵 초기화

    // 캐릭터 위치를 빠르게 찾기 위한 맵
    const gridCharMap = {}; // { "x,y": [{charNameInitial, team}, ...], ... }
    [...allyChars, ...enemyChars].forEach(char => {
        if (char.isAlive && char.posX !== -1 && char.posY !== -1) {
            const key = `${char.posX},${char.posY}`;
            if (!gridCharMap[key]) gridCharMap[key] = [];
            const nameInitial = char.name.length > 1 ? char.name.substring(0,2) : char.name.substring(0,1);
            gridCharMap[key].push({ initial: nameInitial, team: (allyChars.includes(char) ? 'ally' : 'enemy') });
        }
    });

    for (let y = 0; y < MAP_HEIGHT; y++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'map-row'; // 이 클래스는 index.html의 CSS에 정의되어 있어야 함
        for (let x = 0; x < MAP_WIDTH; x++) {
            const cellDiv = document.createElement('div');
            cellDiv.className = 'map-cell'; // 이 클래스는 index.html의 CSS에 정의되어 있어야 함
            cellDiv.dataset.x = x;
            cellDiv.dataset.y = y;

            const key = `${x},${y}`;
            if (gridCharMap[key]) {
                gridCharMap[key].forEach(c => {
                    const charMarker = document.createElement('span');
                    // charMarker 클래스는 index.html의 CSS에 정의 필요 (.char-marker, .ally, .enemy)
                    charMarker.className = `char-marker ${c.team}`;
                    charMarker.textContent = c.initial;
                    cellDiv.appendChild(charMarker);
                });
            }
            // 맵 셀 클릭 이벤트 핸들러는 script.js에서 관리하거나, 여기서 콜백 형태로 전달받을 수 있습니다.
            // 예: cellDiv.onclick = () => handleMapCellClickCallback(x, y);
            rowDiv.appendChild(cellDiv);
        }
        // ***** CORRECTION HERE *****
        mapContainerElement.appendChild(rowDiv); // Was: mapContainer.appendChild(rowDiv);
    }
}
