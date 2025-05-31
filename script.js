// --- 0. 상수 정의 ---
const MAP_WIDTH = 5;
const MAP_HEIGHT = 5;

const SKILLS = {
    // [근성]
    SKILL_RESILIENCE: {
        id: "SKILL_RESILIENCE",
        name: "근성",
        type: "어그로",
        description: "자신에게 현재 체력의 2.5배 보호막 부여. 해당 턴에 발생한 모든 아군의 감소한 체력을 대신 감소.",
        targetType: "self",
        targetSelection: "self", // 명시적으로 추가
        execute: (caster, allies, enemies, battleLog) => {
            const shieldAmount = caster.currentHp * 2.5;
            caster.shield += shieldAmount;
            battleLog(`🛡️ ${caster.name}이(가) [근성]을 사용하여 ${shieldAmount.toFixed(0)}의 보호막을 얻었습니다! (현재 보호막: ${caster.shield.toFixed(0)})`);
            caster.aggroDamageStored = 0;
            // '대신 감소' 로직을 위해 버프 추가 제안
            // caster.addBuff('resilience_active', '근성 활성', 1, {});
        }
    },
    // [반격]
    SKILL_COUNTER: {
        id: "SKILL_COUNTER",
        name: "반격",
        type: "카운터",
        description: "자신이 지닌 보호막을 모든 아군에게 균등하게 나눔. 해당 턴에 자신이 공격받은 후, 모든 적군에게 (받는 피해)x1.2 피해. 아군이 공격받은 후, 모든 적군에게 (받는 피해)x0.5 피해.",
        targetType: "all_allies",
        targetSelection: "all_allies", // 명시적으로 추가 (UI 표시용)
        execute: (caster, allies, enemies, battleLog) => {
            if (caster.shield > 0) {
                const liveAllies = allies.filter(a => a.isAlive);
                if (liveAllies.length > 0) {
                    const shieldPerAlly = caster.shield / liveAllies.length;
                    liveAllies.forEach(ally => {
                        ally.shield += shieldPerAlly;
                        battleLog(`✨ ${caster.name}이(가) [반격]을 사용하여 ${ally.name}에게 ${shieldPerAlly.toFixed(0)}의 보호막을 나누어 주었습니다. (총 ${ally.shield.toFixed(0)})`);
                    });
                    caster.shield = 0;
                } else {
                    battleLog(`✨ ${caster.name}이(가) [반격]을 사용했지만 아군이 없어 보호막을 나눌 수 없습니다.`);
                }
            } else {
                battleLog(`✨ ${caster.name}이(가) [반격]을 사용했지만 보호막이 없어 나눌 수 없습니다.`);
            }
            // 피해 반사 로직을 위해 버프 추가 제안
            // caster.addBuff('counter_active', '반격 활성', 1, {});
        }
    },
    // [도발]
    SKILL_PROVOKE: {
        id: "SKILL_PROVOKE",
        name: "도발",
        type: "어그로",
        description: "해당 턴에 자신의 받는 피해 0.3으로 감소. 다음 적군 턴 동안 모든 적군은 자신만을 대상으로 공격. 해당 턴에 자신의 감소한 체력 총합 저장.",
        targetType: "self",
        targetSelection: "self",
        execute: (caster, allies, enemies, battleLog) => {
            caster.addBuff('provoke_damage_reduction', '피해 감소 (도발)', 1, { damageReduction: 0.7 });
            enemies.filter(e => e.isAlive).forEach(enemy => {
                enemy.addDebuff('provoked', '도발 (타겟 고정)', 2, { targetId: caster.id }); // effect 객체에 targetId로 명시
            });
            caster.aggroDamageStored = 0;
            battleLog(`🎯 ${caster.name}이(가) [도발]을 사용하여 받는 피해가 감소하고 모든 적군이 ${caster.name}을(를) 공격하도록 도발했습니다.`);
        }
    },
    // [역습]
    SKILL_REVERSAL: {
        id: "SKILL_REVERSAL",
        name: "역습",
        type: "카운터",
        description: "자신의 현재 체력 0.5로 감소. 해당 턴에 자신이 공격받은 후, 홀수 턴에는 (공격력 + [도발] 저장 피해)x1.5 물리 피해, 짝수 턴에는 (마법 공격력 + [도발] 저장 피해)x1.5 마법 피해를 공격한 적군에게 줌. 반격 후, 도발 저장량 초기화.",
        targetType: "self",
        targetSelection: "self",
        execute: (caster, allies, enemies, battleLog) => {
            const hpLoss = caster.currentHp * 0.5;
            caster.currentHp -= hpLoss;
            if (caster.currentHp < 1) caster.currentHp = 1;
            battleLog(`💥 ${caster.name}이(가) [역습]을 사용하여 체력을 ${hpLoss.toFixed(0)} 잃고 ${caster.currentHp.toFixed(0)}이 되었습니다.`);
            caster.addBuff('reversal_active', '역습 대기', 1, {});
        }
    },
    // [허상]
    SKILL_ILLUSION: {
        id: "SKILL_ILLUSION",
        name: "허상",
        type: "지정 버프",
        description: "단일 강화. 자신에게 사용 시 (공격)x0.5 체력 회복. 다른 아군에게 사용 시 자신의 (공격)x0.2 체력 잃고 아군 (공격)x2.0 증가(2턴). 턴 종료 시 목표 적군에게 (공격)x0.5 추가 공격.",
        targetType: "single_ally_or_self",
        targetSelection: "ally_or_self",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) { // target이 없을 경우 방어
                battleLog(`[허상] 스킬 대상을 찾을 수 없습니다.`);
                return;
            }
            if (caster.id === target.id) {
                const healAmount = caster.atk * 0.5;
                caster.currentHp = Math.min(caster.maxHp, caster.currentHp + healAmount);
                battleLog(`💖 ${caster.name}이(가) [허상]을 자신에게 사용하여 ${healAmount.toFixed(0)}의 체력을 회복했습니다. (${caster.currentHp.toFixed(0)} HP)`);
            } else {
                const hpLoss = caster.atk * 0.2;
                caster.currentHp -= hpLoss;
                if (caster.currentHp < 1) caster.currentHp = 1;
                battleLog(`💔 ${caster.name}이(가) [허상]을 ${target.name}에게 사용하여 ${hpLoss.toFixed(0)}의 체력을 잃었습니다. (${caster.currentHp.toFixed(0)} HP)`);
                target.addBuff('illusion_atk_boost', '공격력 증가 (허상)', 2, { multiplier: 2.0 }); // atkBoost 대신 multiplier 등으로 명확화
                battleLog(`💪 ${target.name}의 공격력이 2배 증가했습니다! (2턴)`);
            }
            // 턴 종료 추가 공격을 위해 어떤 적을 대상으로 할지 선택하는 로직 필요 (또는 첫번째 적 등으로 자동 지정)
            const firstAliveEnemy = enemies.find(e => e.isAlive);
            if (firstAliveEnemy) {
                 caster.addBuff('illusion_end_turn_attack', '턴 종료 추가 공격 (허상)', 1, { attackerId: caster.id, originalTargetId: target.id, enemyTargetId: firstAliveEnemy.id });
            } else {
                battleLog(`[허상]의 턴 종료 추가 공격 대상을 찾을 수 없습니다.`);
            }
        }
    },
    // [허무]
    SKILL_NIHILITY: {
        id: "SKILL_NIHILITY",
        name: "허무",
        type: "지정 버프",
        description: "단일 강화. 목표 아군의 [상태 이상], [제어], [속성 감소] 랜덤 2개 정화. [버프 집합] 중 랜덤 1개 부여(2턴).",
        targetType: "single_ally",
        targetSelection: "ally",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) {
                battleLog(`[허무] 스킬 대상을 찾을 수 없습니다.`);
                return;
            }
            // 디버프 카테고리 정의가 Character 클래스 또는 디버프 객체 자체에 필요
            // 예: d.category === 'status_ailment'
            const removableDebuffs = target.debuffs.filter(d => ['상태 이상', '제어', '속성 감소'].includes(d.effect.category || '기타'));
            if (removableDebuffs.length > 0) {
                for (let i = 0; i < Math.min(2, removableDebuffs.length); i++) {
                    const debuffIndex = Math.floor(Math.random() * removableDebuffs.length);
                    const debuffToRemove = removableDebuffs[debuffIndex];
                    target.removeDebuffById(debuffToRemove.id); // 수정: removeDebuffById 사용
                    battleLog(`✨ ${target.name}의 [${debuffToRemove.name}] 디버프가 정화되었습니다.`);
                    removableDebuffs.splice(debuffIndex, 1);
                }
            } else {
                battleLog(`✨ ${target.name}에게 정화할 디버프가 없습니다.`);
            }

            const buffChoices = [
                { id: 'nihility_heal', name: '턴 시작 시 HP 회복 (허무)', turns: 2, effect: { type: 'turn_start_heal', value: caster.atk * 0.5 } },
                { id: 'nihility_reflect', name: '피해 반사 (허무)', turns: 2, effect: { type: 'damage_reflect', value: 0.3 } },
                { id: 'nihility_def', name: '방어력 증가 (허무)', turns: 2, effect: { type: 'def_boost_multiplier', value: 0.3 } }, // def_boost 대신 def_boost_multiplier 등으로 명확화
                { id: 'nihility_atk', name: '공격력 증가 (허무)', turns: 2, effect: { type: 'atk_boost_multiplier', value: 1.5 } }
            ];
            const chosenBuff = buffChoices[Math.floor(Math.random() * buffChoices.length)];
            target.addBuff(chosenBuff.id, chosenBuff.name, chosenBuff.turns, chosenBuff.effect);
            battleLog(`🌟 ${target.name}이(가) [허무]를 통해 [${chosenBuff.name}] 버프를 획득했습니다! (2턴)`);
        }
    },
    // [실존]
    SKILL_REALITY: {
        id: "SKILL_REALITY",
        name: "실존",
        type: "광역 버프",
        description: "모든 아군 방어력 x0.3 증가 (2턴). 자신은 [실재] 4스택 추가 획득 (2턴, 해제 불가). 연속 사용 시 추가 2스택 획득. 3턴 연속 사용 불가.",
        targetType: "all_allies",
        targetSelection: "all_allies",
        execute: (caster, allies, enemies, battleLog) => {
            const currentTurnNum = currentTurn;
            const lastUsedTurn = caster.lastSkillTurn[SKILLS.SKILL_REALITY.id] || 0;

            if (lastUsedTurn !== 0 && currentTurnNum - lastUsedTurn < 3) {
                 battleLog(`❌ ${caster.name}은(는) [실존]을 ${3 - (currentTurnNum - lastUsedTurn)}턴 후에 사용할 수 있습니다.`);
                 return false; // Indicate skill failure
            }

            allies.filter(a => a.isAlive).forEach(ally => {
                ally.addBuff('reality_def_boost', '방어력 증가 (실존)', 2, { defBoostMultiplier: 0.3 });
            });
            battleLog(`🛡️ 모든 아군의 방어력이 30% 증가했습니다! (2턴)`);

            let realityStacks = 4;
            battleLog(`✨ ${caster.name}이(가) [실재] ${realityStacks}스택을 추가 획득했습니다!`);

            caster.addBuff('reality_stacks', '실재', 2, { atkBoostPerStack: 0.4, stacks: realityStacks, unremovable: true });
            caster.lastSkillTurn[SKILLS.SKILL_REALITY.id] = currentTurnNum;
            return true; // Indicate skill success
        }
    },
    // [진리]
    SKILL_TRUTH: {
        id: "SKILL_TRUTH",
        name: "진리",
        type: "광역 디버프",
        description: "모든 적군에게 2턴 동안 [중독] 상태 부여 (턴 종료 시 사용자의 공격력 x0.5 고정 피해). 중독 결산 후 랜덤 적군에게 사용자의 공격력 x0.3 추가 공격 부여.",
        targetType: "all_enemies",
        targetSelection: "all_enemies",
        execute: (caster, enemies, battleLog) => { 
            enemies.filter(e => e.isAlive).forEach(enemy => {
                enemy.addDebuff('poison', '중독', 2, { damagePerTurn: caster.atk * 0.5, type: 'fixed', casterId: caster.id });
                battleLog(`☠️ ${enemy.name}이(가) [중독] 상태에 빠졌습니다! (2턴)`);
            });
            caster.addBuff('truth_caster_marker', '진리 사용자 (추가 공격 대기)', 1, { originalCasterId: caster.id });
        }
    },
    // [서막]
    SKILL_OVERTURE: {
        id: "SKILL_OVERTURE",
        name: "서막",
        type: "단일 공격",
        description: "공격력 200% 물리 피해/마법 공격력 250% 마법 피해를 가하고 상대에게 [흠집]을 새긴다. [흠집]: 기본 2턴, 중첩 시 마지막 흠집 유지 시간에 따름. 3회까지 중첩. 추가 공격 이후 사라짐.",
        targetType: "single_enemy",
        targetSelection: "enemy",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) { battleLog(`[서막] 스킬 대상을 찾을 수 없습니다.`); return; }
            const damageType = caster.atk >= caster.matk ? 'physical' : 'magical'; 
            const skillPower = damageType === 'physical' ? 2.0 : 2.5;
            const damage = calculateDamage(caster, target, skillPower, damageType);
            target.takeDamage(damage, battleLog, caster); 
            battleLog(`⚔️ ${caster.name}이(가) [서막]으로 ${target.name}에게 ${damage.toFixed(0)}의 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다!`);

            target.addDebuff('scratch', '흠집', 2, { maxStacks: 3, overrideDuration: true, removerSkillId: SKILLS.SKILL_CLIMAX.id });
            battleLog(`🩹 ${target.name}에게 [흠집]이 새겨졌습니다. (현재 ${target.getDebuffStacks('scratch')}스택)`);
        }
    },
    // [절정]
    SKILL_CLIMAX: {
        id: "SKILL_CLIMAX",
        name: "절정",
        type: "단일 공격",
        description: "공격력 270% 물리/마법 공격력 310% 마법 피해 (3타). 이후 상대에게 새겨진 [흠집] 수에 따라 각각 공격력 25%/35%/45% 물리 / 마법 공격력 30%/40%/50% 마법 추가 공격 2회 시행. 쇠약 상태 부여.",
        targetType: "single_enemy",
        targetSelection: "enemy",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) { battleLog(`[절정] 스킬 대상을 찾을 수 없습니다.`); return; }
            const damageType = caster.atk >= caster.matk ? 'physical' : 'magical';
            const skillPower = damageType === 'physical' ? 2.7 : 3.1;

            for (let i = 0; i < 3; i++) {
                const damage = calculateDamage(caster, target, skillPower / 3, damageType);
                target.takeDamage(damage, battleLog, caster); 
                battleLog(`⚔️ ${caster.name}이(가) [절정]으로 ${target.name}에게 ${damage.toFixed(0)}의 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다! (${i + 1}타)`);
                if (!target.isAlive) break;
            }
            if (!target.isAlive) return;

            const scratchStacks = target.getDebuffStacks('scratch');
            if (scratchStacks > 0) {
                let bonusSkillPowerPercent = 0;
                if (damageType === 'physical') {
                    if (scratchStacks === 1) bonusSkillPowerPercent = 0.25;
                    else if (scratchStacks === 2) bonusSkillPowerPercent = 0.35;
                    else if (scratchStacks >= 3) bonusSkillPowerPercent = 0.45;
                } else { // magical
                    if (scratchStacks === 1) bonusSkillPowerPercent = 0.30;
                    else if (scratchStacks === 2) bonusSkillPowerPercent = 0.40;
                    else if (scratchStacks >= 3) bonusSkillPowerPercent = 0.50;
                }

                for (let i = 0; i < 2; i++) {
                    const bonusDamage = calculateDamage(caster, target, bonusSkillPowerPercent, damageType); 
                    target.takeDamage(bonusDamage, battleLog, caster); 
                    battleLog(`💥 [흠집] 효과로 ${caster.name}이(가) ${target.name}에게 ${bonusDamage.toFixed(0)}의 추가 피해를 주었습니다! (${i + 1}회)`);
                    if (!target.isAlive) break;
                }
                if (target.isAlive) target.removeDebuffById('scratch'); 
                battleLog(`🩹 ${target.name}의 [흠집]이 사라졌습니다.`);
            }
            if (!target.isAlive) return;

            target.addDebuff('weakness', '쇠약', 2, { damageMultiplierReduction: 0.2 }); 
            battleLog(`📉 ${target.name}이(가) [쇠약] 상태에 빠졌습니다! (2턴)`);
        }
    },
    // [간파]
    SKILL_DISCERNMENT: {
        id: "SKILL_DISCERNMENT",
        name: "간파",
        type: "단일 공격",
        description: "공격력 190% 물리/240% 마법 피해 (2타). 이후 공격력 50% 물리/마법 공격력 70% 마법 피해를 가하며 상대에게 [쇠약] 상태 부여.",
        targetType: "single_enemy",
        targetSelection: "enemy",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) { battleLog(`[간파] 스킬 대상을 찾을 수 없습니다.`); return; }
            const damageType = caster.atk >= caster.matk ? 'physical' : 'magical';
            const skillPower1 = damageType === 'physical' ? 1.9 : 2.4; 
            
            for (let i=0; i<2; i++) {
                const damage1 = calculateDamage(caster, target, skillPower1 / 2, damageType); 
                target.takeDamage(damage1, battleLog, caster);
                battleLog(`⚔️ ${caster.name}이(가) [간파]로 ${target.name}에게 ${damage1.toFixed(0)}의 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다! (${i+1}타)`);
                if (!target.isAlive) return;
            }

            const skillPower2 = damageType === 'physical' ? 0.5 : 0.7;
            const damage2 = calculateDamage(caster, target, skillPower2, damageType);
            target.takeDamage(damage2, battleLog, caster);
            battleLog(`⚔️ ${caster.name}이(가) [간파]의 추가타로 ${target.name}에게 ${damage2.toFixed(0)}의 추가 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다!`);
            if (!target.isAlive) return;
            
            target.addDebuff('weakness', '쇠약', 2, { damageMultiplierReduction: 0.2 });
            battleLog(`📉 ${target.name}이(가) [쇠약] 상태에 빠졌습니다! (2턴)`);
        }
    },
    // [파열]
    SKILL_RUPTURE: {
        id: "SKILL_RUPTURE",
        name: "파열",
        type: "광역 공격",
        description: "주 목표에게 공격력 210% 물리/마법 공격력 260% 마법 피해. 부 목표에게 공격력 130% 물리/마법 공격력 180% 마법 피해. [쇠약] 상태 적에게 적중 시 추가 고정 피해 30%.",
        targetType: "multi_enemy",
        targetSelection: "two_enemies",
        execute: (caster, mainTarget, subTarget, allies, enemies, battleLog) => {
            if (!mainTarget) { battleLog(`[파열] 스킬 주 대상을 찾을 수 없습니다.`); return; }
            const damageType = caster.atk >= caster.matk ? 'physical' : 'magical';
            
            const mainSkillPower = damageType === 'physical' ? 2.1 : 2.6;
            const mainDamage = calculateDamage(caster, mainTarget, mainSkillPower, damageType);
            mainTarget.takeDamage(mainDamage, battleLog, caster);
            battleLog(`💥 ${caster.name}이(가) [파열]로 주 목표 ${mainTarget.name}에게 ${mainDamage.toFixed(0)}의 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다!`);
            if (mainTarget.hasDebuff('weakness')) {
                const bonusFixedDamage = mainDamage * 0.3; 
                mainTarget.takeDamage(bonusFixedDamage, battleLog, caster); 
                battleLog(`🔥 [쇠약] 상태인 ${mainTarget.name}에게 ${bonusFixedDamage.toFixed(0)}의 추가 고정 피해!`);
            }
            if (!mainTarget.isAlive && !subTarget) return; 

            if (subTarget && subTarget.isAlive && mainTarget.id !== subTarget.id) {
                const subSkillPower = damageType === 'physical' ? 1.3 : 1.8;
                const subDamage = calculateDamage(caster, subTarget, subSkillPower, damageType);
                subTarget.takeDamage(subDamage, battleLog, caster);
                battleLog(`💥 ${caster.name}이(가) [파열]로 부 목표 ${subTarget.name}에게 ${subDamage.toFixed(0)}의 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다!`);
                if (subTarget.hasDebuff('weakness')) {
                    const bonusFixedDamageSub = subDamage * 0.3;
                    subTarget.takeDamage(bonusFixedDamageSub, battleLog, caster);
                    battleLog(`🔥 [쇠약] 상태인 ${subTarget.name}에게 ${bonusFixedDamageSub.toFixed(0)}의 추가 고정 피해!`);
                }
            }
        }
    }
};

// --- 0.5. HTML 요소 가져오기 헬퍼 함수 ---
function getElement(id) {
    return document.getElementById(id);
}

// --- 1. 전역 변수 및 UI 요소 ---
// 게임 상태 변수
let allyCharacters = [];
let enemyCharacters = [];
let currentTurn = 0;
let isBattleStarted = false; 
let currentActingCharacterIndex = 0;
let playerActionsQueue = [];
let characterPositions = {}; // 캐릭터 위치 추적: { "x,y": characterId }

// 스킬/행동 선택 관련 전역 변수
let selectedAction = { 
    type: null, // 'skill' 또는 'move'
    casterId: null,
    skillId: null, 
    targetId: null, 
    subTargetId: null, 
    moveDelta: null // { dx, dy }
};

// UI 요소 (getElement 함수 정의 후 선언)
const skillSelectionArea = getElement('skillSelectionArea');
const currentActingCharName = getElement('currentActingCharName');
const availableSkillsDiv = getElement('availableSkills');
const movementControlsArea = getElement('movementControlsArea'); // 이동 버튼 영역
const selectedTargetName = getElement('selectedTargetName');
const confirmActionButton = getElement('confirmActionButton');
const executeTurnButton = getElement('executeTurnButton');
const startButton = getElement('startButton');
const nextTurnButton = getElement('nextTurnButton');
const battleLogDiv = getElement('battleLog');
const mapGridContainer = getElement('mapGridContainer'); // 맵 컨테이너


// --- 2. 핵심 클래스 정의 ---
class Character {
    constructor(name, type, currentHpOverride = null) { 
        this.id = Math.random().toString(36).substring(2, 11);
        this.name = name;
        this.type = type;

        this.atk = 15;
        this.matk = 15;
        this.def = 15;
        this.mdef = 15;

        switch (type) {
            case "천체": this.matk = 20; break;
            case "암석": this.def = 20; break;
            case "야수": this.atk = 20; break;
            case "나무": this.mdef = 20; break;
        }

        this.maxHp = 100;
        this.currentHp = (currentHpOverride !== null && !isNaN(currentHpOverride) && currentHpOverride > 0) 
                       ? Math.min(currentHpOverride, this.maxHp) 
                       : this.maxHp;
        if (this.currentHp > this.maxHp) this.currentHp = this.maxHp;

        this.isAlive = true;
        this.skills = Object.values(SKILLS).map(skill => skill.id);
        this.buffs = [];
        this.debuffs = [];
        this.shield = 0;
        this.aggroDamageStored = 0;
        this.lastSkillTurn = {};
        this.lastAttackedBy = null;
        this.currentTurnDamageTaken = 0;

        this.posX = -1;
        this.posY = -1;
    }

    addBuff(id, name, turns, effect, unremovable = false) {
        let existingBuff = this.buffs.find(b => b.id === id);
        if (existingBuff) {
            existingBuff.turnsLeft = Math.max(existingBuff.turnsLeft, turns); 
            if (effect.stacks && existingBuff.stacks !== undefined) {
                existingBuff.stacks = (existingBuff.stacks || 0) + (effect.stacks || 0);
            } else if (effect.stacks) { 
                 existingBuff.stacks = effect.stacks;
            }
            existingBuff.effect = {...existingBuff.effect, ...effect};

        } else {
            this.buffs.push({ id, name, turnsLeft: turns, effect, unremovable, stacks: effect.stacks || 1 });
        }
    }

    addDebuff(id, name, turns, effect) {
        let existingDebuff = this.debuffs.find(d => d.id === id);
        if (existingDebuff) {
            if (effect.overrideDuration) {
                existingDebuff.turnsLeft = turns;
            } else {
                existingDebuff.turnsLeft = Math.max(existingDebuff.turnsLeft, turns);
            }

            if (effect.maxStacks && existingDebuff.stacks !== undefined) {
                existingDebuff.stacks = Math.min(effect.maxStacks, (existingDebuff.stacks || 0) + 1);
            } else if (effect.maxStacks) { 
                existingDebuff.stacks = 1;
            }
             existingDebuff.effect = {...existingDebuff.effect, ...effect};
        } else {
            this.debuffs.push({ id, name, turnsLeft: turns, effect, stacks: effect.maxStacks ? 1 : undefined });
        }
    }

    getDebuffStacks(id) {
        const debuff = this.debuffs.find(d => d.id === id);
        return debuff && debuff.stacks !== undefined ? debuff.stacks : (debuff ? 1 : 0) ; 
    }

    hasBuff(id) {
        return this.buffs.some(b => b.id === id && b.turnsLeft > 0);
    }
    hasDebuff(id) {
        return this.debuffs.some(d => d.id === id && d.turnsLeft > 0);
    }

    removeBuffById(id) {
        this.buffs = this.buffs.filter(b => b.id !== id || b.unremovable);
    }
    removeDebuffById(id) {
        this.debuffs = this.debuffs.filter(d => d.id !== id);
    }

    takeDamage(rawDamage, logFn, attacker = null) { 
        if (!this.isAlive) return;
        let finalDamage = rawDamage;
        const initialHp = this.currentHp;

        const provokeReductionBuff = this.buffs.find(b => b.id === 'provoke_damage_reduction' && b.turnsLeft > 0);
        if (provokeReductionBuff) {
            finalDamage *= (1 - provokeReductionBuff.effect.damageReduction);
            logFn(`🛡️ ${this.name}은(는) [도발] 효과로 ${rawDamage.toFixed(0)}의 피해를 ${finalDamage.toFixed(0)}으로 감소시켰습니다.`);
        }

        if (this.shield > 0) {
            const damageToShield = Math.min(finalDamage, this.shield);
            this.shield -= damageToShield;
            finalDamage -= damageToShield;
            logFn(`🛡️ ${this.name}의 보호막이 ${damageToShield.toFixed(0)}만큼 피해를 흡수했습니다. (남은 보호막: ${this.shield.toFixed(0)})`);
        }
        
        this.currentHp -= finalDamage;
        const actualDamageTakenThisHit = Math.max(0, initialHp - this.currentHp - (this.shield > 0 ? 0 : Math.max(0, finalDamage - (initialHp - this.currentHp)) ) );

        this.currentTurnDamageTaken += actualDamageTakenThisHit;
        this.lastAttackedBy = attacker ? attacker.id : null;

        if (attacker && attacker.isAlive) { 
            if (this.hasBuff('counter_active')) { 
                const counterDamage = actualDamageTakenThisHit * 1.2; 
                if (counterDamage > 0) {
                    logFn(`↩️ ${this.name}이(가) [반격]으로 ${attacker.name}에게 ${counterDamage.toFixed(0)}의 피해를 되돌려주었습니다!`);
                    attacker.takeDamage(counterDamage, logFn, this); 
                }
            }
            if (this.hasBuff('reversal_active')) {
                const storedDamage = this.aggroDamageStored || 0;
                let reversalDamage = 0;
                let reversalDamageType = '';
                if (currentTurn % 2 !== 0) { 
                    reversalDamage = (this.getEffectiveStat('atk') + storedDamage) * 1.5; 
                    reversalDamageType = 'physical';
                } else { 
                    reversalDamage = (this.getEffectiveStat('matk') + storedDamage) * 1.5; 
                    reversalDamageType = 'magical';
                }
                if (reversalDamage > 0) {
                    logFn(`⚡ ${this.name}이(가) [역습]으로 ${attacker.name}에게 ${reversalDamage.toFixed(0)}의 ${reversalDamageType} 피해를 주었습니다!`);
                    attacker.takeDamage(reversalDamage, logFn, this); 
                }
                this.aggroDamageStored = 0;
                this.removeBuffById('reversal_active');
            }
        }
        
        const reflectBuff = this.buffs.find(b => b.effect.type === 'damage_reflect' && b.turnsLeft > 0);
        if (reflectBuff && attacker && attacker.isAlive) {
            const reflectedDamage = actualDamageTakenThisHit * reflectBuff.effect.value;
            if (reflectedDamage > 0) {
                logFn(`🛡️ ${this.name}이(가) [${reflectBuff.name}] 효과로 ${attacker.name}에게 ${reflectedDamage.toFixed(0)}의 피해를 반사했습니다!`);
                attacker.takeDamage(reflectedDamage, logFn, this);
            }
        }

        if (this.currentHp <= 0) {
            this.currentHp = 0;
            if (this.isAlive) { 
                console.log("[DEBUG takeDamage] Before death log - typeof logFn:", typeof logFn, "Actual value of logFn:", logFn);
                 logFn(`💀 ${this.name}이(가) 쓰러졌습니다!`);
            }
            this.isAlive = false;
        }
        console.log("[DEBUG takeDamage] Before final HP log (line 541 suspected) - typeof logFn:", typeof logFn, "Actual value of logFn:", logFn);
        logFn(`[${this.name}의 HP]: ${initialHp.toFixed(0)} -> ${this.currentHp.toFixed(0)} (보호막: ${this.shield.toFixed(0)})`);
    }

    getEffectiveStat(statName) {
        let value = this[statName];
        this.buffs.forEach(buff => {
            if (buff.turnsLeft > 0) {
                if (buff.effect.type === `${statName}_boost_multiplier`) value *= buff.effect.value;
                if (buff.effect.type === `${statName}_boost_flat`) value += buff.effect.value;
                if (buff.id === 'reality_stacks' && (statName === 'atk' || statName === 'matk') && buff.effect.atkBoostPerStack) {
                    value += (buff.effect.atkBoostPerStack * buff.stacks * this[statName === 'atk' ? 'atk' : 'matk']); 
                }
                 if (buff.id === 'illusion_atk_boost' && statName === 'atk' && buff.effect.multiplier) { 
                    value *= buff.effect.multiplier;
                }
            }
        });
        this.debuffs.forEach(debuff => {
            if (debuff.turnsLeft > 0) {
                // 디버프로 인한 스탯 감소 로직 추가 가능
            }
        });
        return value;
    }
}

// --- 3. 유틸리티 및 UI 관리 함수 ---
function logToBattleLog(message) {
    if (battleLogDiv) {
        battleLogDiv.innerHTML += message + '\n';
        battleLogDiv.scrollTop = battleLogDiv.scrollHeight;
    } else {
        console.error("battleLogDiv is not defined!");
    }
}

function getRandomEmptyCell() {
    const occupiedCells = new Set(Object.keys(characterPositions));
    const emptyCells = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (!occupiedCells.has(`${x},${y}`)) {
                emptyCells.push({ x, y });
            }
        }
    }
    if (emptyCells.length === 0) return null;
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

function addCharacter(team) {
    const nameInput = getElement('charName');
    const typeInput = getElement('charType');
    const hpInput = getElement('charCurrentHp'); 

    const name = nameInput.value.trim() || (team === 'ally' ? `아군${allyCharacters.length+1}` : `적군${enemyCharacters.length+1}`);
    const type = typeInput.value;
    let currentHp = hpInput.value.trim() === '' ? null : parseInt(hpInput.value);

    if (!name) { alert('캐릭터 이름을 입력해 주세요.'); nameInput.focus(); return; }
    if (currentHp !== null && (isNaN(currentHp) || currentHp <= 0)) {
        alert('유효한 현재 체력을 입력하거나 비워 두세요.'); hpInput.focus(); return;
    }

    const newChar = new Character(name, type, currentHp);
    const cell = getRandomEmptyCell();
    if (cell) {
        newChar.posX = cell.x;
        newChar.posY = cell.y;
        characterPositions[`${cell.x},${cell.y}`] = newChar.id;
    } else {
        logToBattleLog(`경고: ${name}을(를) 배치할 빈 공간이 맵에 없습니다.`);
    }

    if (team === 'ally') {
        allyCharacters.push(newChar);
        logToBattleLog(`✅ 아군 [${name} (${type})] (HP: ${newChar.currentHp}/${newChar.maxHp}) [${newChar.posX},${newChar.posY}] 합류.`);
    } else if (team === 'enemy') {
        enemyCharacters.push(newChar);
        logToBattleLog(`🔥 적군 [${name} (${type})] (HP: ${newChar.currentHp}/${newChar.maxHp}) [${newChar.posX},${newChar.posY}] 등장.`);
    }
    hpInput.value = '';
    displayCharacters();
}

function deleteCharacter(characterId, team) {
    let targetArray = team === 'ally' ? allyCharacters : enemyCharacters;
    const charIndex = targetArray.findIndex(char => char.id === characterId);

    if (charIndex > -1) {
        const charToRemove = targetArray[charIndex];
        if (charToRemove.posX !== -1 && charToRemove.posY !== -1) {
             delete characterPositions[`${charToRemove.posX},${charToRemove.posY}`];
        }
        targetArray.splice(charIndex, 1);
        logToBattleLog(`🗑️ ${team === 'ally' ? '아군' : '적군'} [${charToRemove.name}] 제외됨.`);
    }
    displayCharacters();
}

function createCharacterCard(character, team) {
    const card = document.createElement('div');
    card.className = 'character-stats';
    if (selectedAction.targetId === character.id || (selectedAction.type === 'skill' && SKILLS[selectedAction.skillId]?.targetSelection === 'two_enemies' && selectedAction.subTargetId === character.id)) {
        card.classList.add('selected');
    }

    card.innerHTML = `
        <p><strong>${character.name} (${character.type})</strong> ${character.posX !== -1 ? `[${character.posX},${character.posY}]` : ''}</p>
        <p>HP: ${character.currentHp.toFixed(0)} / ${character.maxHp.toFixed(0)} ${character.shield > 0 ? `(+${character.shield.toFixed(0)}🛡️)` : ''}</p>
        <p>공격력: ${character.getEffectiveStat('atk').toFixed(0)} | 마법 공격력: ${character.getEffectiveStat('matk').toFixed(0)}</p>
        <p>방어력: ${character.getEffectiveStat('def').toFixed(0)} | 마법 방어력: ${character.getEffectiveStat('mdef').toFixed(0)}</p>
        <p>상태: ${character.isAlive ? '생존' : '쓰러짐'}</p>
        ${character.buffs.length > 0 ? `<p>버프: ${character.buffs.map(b => `${b.name}(${b.turnsLeft}턴${b.stacks > 1 ? `x${b.stacks}` : ''})`).join(', ')}</p>` : ''}
        ${character.debuffs.length > 0 ? `<p>디버프: ${character.debuffs.map(d => `${d.name}(${d.turnsLeft}턴${d.stacks > 1 ? `x${d.stacks}`:''})`).join(', ')}</p>` : ''}
        <button class="delete-char-button" onclick="deleteCharacter('${character.id}', '${team}')">X</button>
    `;
    card.onclick = (event) => {
        if (event.target.classList.contains('delete-char-button')) return;
        if (isBattleStarted && skillSelectionArea.style.display !== 'none' && selectedAction.type === 'skill') {
            selectTarget(character.id);
        }
    };
    return card;
}

function displayCharacters() {
    const allyDisplay = getElement('allyCharacters');
    const enemyDisplay = getElement('enemyCharacters');

    allyDisplay.innerHTML = allyCharacters.length === 0 ? '<p>아군 캐릭터가 없습니다.</p>' : '';
    allyCharacters.forEach(char => allyDisplay.appendChild(createCharacterCard(char, 'ally')));

    enemyDisplay.innerHTML = enemyCharacters.length === 0 ? '<p>적군 캐릭터가 없습니다.</p>' : '';
    enemyCharacters.forEach(char => enemyDisplay.appendChild(createCharacterCard(char, 'enemy')));

    if (typeof renderMapGrid === 'function') { 
        renderMapGrid(mapGridContainer, allyCharacters, enemyCharacters);
    } else if (mapGridContainer) { 
        mapGridContainer.innerHTML = '<p>맵 로딩 실패: renderMapGrid 함수 없음.</p>';
    }
}

// --- 4. 핵심 전투 로직 함수 ---
function calculateDamage(attacker, defender, skillPower, damageType) {
    let damage = 0;
    let attackStat = 0;
    let defenseStat = 0;
    let actualSkillPower = skillPower;

    const attackerWeakness = attacker.debuffs.find(d => d.id === 'weakness' && d.turnsLeft > 0);
    if (attackerWeakness && attackerWeakness.effect.damageMultiplierReduction) {
        actualSkillPower *= (1 - attackerWeakness.effect.damageMultiplierReduction);
    }

    if (damageType === 'physical') {
        attackStat = attacker.getEffectiveStat('atk');
        defenseStat = defender.getEffectiveStat('def');
        damage = (attackStat * actualSkillPower) - defenseStat;
    } else if (damageType === 'magical') {
        attackStat = attacker.getEffectiveStat('matk');
        defenseStat = defender.getEffectiveStat('mdef');
        damage = (attackStat * actualSkillPower) - defenseStat;
    } else if (damageType === 'fixed') {
        damage = actualSkillPower; 
    }
    return Math.max(1, damage);
}

function applyTurnStartEffects(character) {
    character.currentTurnDamageTaken = 0; 

    character.buffs = character.buffs.filter(buff => {
        if (buff.effect.type === 'turn_start_heal' && buff.turnsLeft > 0) {
            const healAmount = buff.effect.value;
            character.currentHp = Math.min(character.maxHp, character.currentHp + healAmount);
            logToBattleLog(`💖 ${character.name}이(가) [${buff.name}] 효과로 ${healAmount.toFixed(0)}HP 회복.`);
        }
        if (!buff.unremovable) buff.turnsLeft--;
        return buff.turnsLeft > 0 || buff.unremovable;
    });

    character.debuffs = character.debuffs.filter(debuff => {
        if (debuff.id === 'poison' && debuff.turnsLeft > 0 && debuff.effect.type === 'fixed') {
            const poisonDamage = debuff.effect.damagePerTurn;
            logToBattleLog(`☠️ ${character.name}이(가) [${debuff.name}]으로 ${poisonDamage.toFixed(0)}의 고정 피해.`);
            character.takeDamage(poisonDamage, logToBattleLog); 
        }
        debuff.turnsLeft--;
        return debuff.turnsLeft > 0;
    });
}

function processEndOfTurnEffects(actingChar) {
    const illusionBuff = actingChar.buffs.find(b => b.id === 'illusion_end_turn_attack' && b.turnsLeft > 0);
    if (illusionBuff) {
        const caster = findCharacterById(illusionBuff.effect.attackerId);
        const enemyTarget = findCharacterById(illusionBuff.effect.enemyTargetId);
        if (caster && enemyTarget && enemyTarget.isAlive) {
            const bonusDamage = calculateDamage(caster, enemyTarget, 0.5, 'physical'); 
            logToBattleLog(`☄️ [허상] 턴 종료 효과! ${caster.name}이(가) ${enemyTarget.name}에게 ${bonusDamage.toFixed(0)} 추가 물리 피해.`);
            enemyTarget.takeDamage(bonusDamage, logToBattleLog, caster);
        }
        actingChar.removeBuffById('illusion_end_turn_attack');
    }

    const truthMarkerBuff = actingChar.buffs.find(b => b.id === 'truth_caster_marker' && b.turnsLeft > 0);
    if (truthMarkerBuff) {
        const originalCaster = findCharacterById(truthMarkerBuff.effect.originalCasterId);
        const aliveEnemies = enemyCharacters.filter(e => e.isAlive);
        if (originalCaster && aliveEnemies.length > 0) {
            const randomEnemyTarget = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            const bonusDamage = calculateDamage(originalCaster, randomEnemyTarget, 0.3, 'physical'); 
            logToBattleLog(`🎯 [진리] 턴 종료 효과! ${originalCaster.name}이(가) ${randomEnemyTarget.name}에게 ${bonusDamage.toFixed(0)} 추가 물리 피해.`);
            randomEnemyTarget.takeDamage(bonusDamage, logToBattleLog, originalCaster);
        }
        actingChar.removeBuffById('truth_caster_marker');
    }
}

// --- 5. 전투 흐름 및 행동 선택 함수 ---
function startBattle() {
    if (allyCharacters.length === 0 || enemyCharacters.length === 0) {
        alert('아군과 적군 모두 최소 한 명 이상의 캐릭터가 필요합니다!'); return;
    }
    if (isBattleStarted) { alert('이미 전투가 시작되었습니다.'); return; }

    isBattleStarted = true;
    currentTurn = 0;
    playerActionsQueue = [];
    currentActingCharacterIndex = 0;
    logToBattleLog('--- 전투 시작 ---');
    [...allyCharacters, ...enemyCharacters].forEach(char => {
        char.currentHp = char.maxHp; 
        char.isAlive = true;
        char.buffs = []; char.debuffs = []; char.shield = 0;
        char.aggroDamageStored = 0; char.lastSkillTurn = {};
        char.lastAttackedBy = null; char.currentTurnDamageTaken = 0;
    });
    displayCharacters();

    startButton.style.display = 'none';
    nextTurnButton.style.display = 'block';
    executeTurnButton.style.display = 'none';

    prepareNextTurn();
}

function prepareNextTurn() {
    if (!isBattleStarted) { alert('전투를 시작해 주세요.'); return; }

    if (playerActionsQueue.length > 0 && currentActingCharacterIndex < allyCharacters.filter(a=>a.isAlive).length) {
         logToBattleLog("모든 아군의 행동을 선택하거나 '턴 실행'을 눌러 주세요.");
    } else if(playerActionsQueue.length === 0 || currentActingCharacterIndex >= allyCharacters.filter(a=>a.isAlive).length) {
        currentTurn++;
        logToBattleLog(`\n=== ${currentTurn} 턴 행동 선택 시작 ===`);
        playerActionsQueue = [];
        currentActingCharacterIndex = 0;
        showSkillSelectionForNextAlly();
    }
}

function showSkillSelectionForNextAlly() {
    const aliveAllies = allyCharacters.filter(char => char.isAlive);
    if (currentActingCharacterIndex >= aliveAllies.length) {
        logToBattleLog('모든 아군 캐릭터의 행동 선택이 완료되었습니다. 턴을 실행하세요.');
        skillSelectionArea.style.display = 'none';
        executeTurnButton.style.display = 'block';
        nextTurnButton.style.display = 'none';
        return;
    }

    const actingChar = aliveAllies[currentActingCharacterIndex];
    currentActingCharName.textContent = actingChar.name;
    selectedAction = { type: null, casterId: actingChar.id, skillId: null, targetId: null, subTargetId: null, moveDelta: null };

    availableSkillsDiv.innerHTML = '';
    actingChar.skills.forEach(skillId => {
        const skill = SKILLS[skillId];
        if (skill) {
            const button = document.createElement('button');
            button.textContent = skill.name;
            let cooldownMessage = ""; 
            if (skill.id === SKILLS.SKILL_REALITY.id) {
                const lastUsed = actingChar.lastSkillTurn[skill.id] || 0;
                if (lastUsed !== 0 && currentTurn - lastUsed < 3) {
                    button.disabled = true;
                    cooldownMessage = ` (${3-(currentTurn-lastUsed)}턴 남음)`;
                }
            }
            button.textContent += cooldownMessage;
            button.onclick = () => selectSkill(skill.id, actingChar);
            availableSkillsDiv.appendChild(button);
        }
    });

    movementControlsArea.innerHTML = '<h4>이동 (선택 시 턴 종료)</h4>';
    const directions = [
        [-1, -1, '↖'], [0, -1, '↑'], [1, -1, '↗'],
        [-1,  0, '←'],             [1,  0, '→'],
        [-1,  1, '↙'], [0,  1, '↓'], [1,  1, '↘']
    ];
    directions.forEach(dir => {
        const button = document.createElement('button');
        button.textContent = dir[2];
        const targetX = actingChar.posX + dir[0];
        const targetY = actingChar.posY + dir[1];
        if (targetX < 0 || targetX >= MAP_WIDTH || targetY < 0 || targetY >= MAP_HEIGHT || characterPositions[`${targetX},${targetY}`]) {
            button.disabled = true;
        }
        button.onclick = () => selectMove({ dx: dir[0], dy: dir[1] }, actingChar);
        movementControlsArea.appendChild(button);
    });

    selectedTargetName.textContent = '없음';
    confirmActionButton.style.display = 'none';
    skillSelectionArea.style.display = 'block';
    executeTurnButton.style.display = 'none';
    nextTurnButton.style.display = 'block';
    displayCharacters();
}

function selectSkill(skillId, caster) {
    selectedAction.type = 'skill';
    selectedAction.skillId = skillId;
    selectedAction.targetId = null; 
    selectedAction.subTargetId = null;
    selectedAction.moveDelta = null;

    const skill = SKILLS[skillId];
    logToBattleLog(`${caster.name}이(가) [${skill.name}] 스킬 선택. 대상을 선택해 주세요.`);

    if (skill.targetSelection === 'self' || skill.targetType === 'all_allies' || skill.targetType === 'all_enemies') {
        selectedAction.targetId = caster.id; 
        selectedTargetName.textContent = skill.targetSelection === 'self' ? caster.name : '전체';
        confirmActionButton.style.display = 'block';
    } else {
        selectedTargetName.textContent = '필요';
        confirmActionButton.style.display = 'none';
    }
    displayCharacters();
}

function selectMove(moveDelta, caster) {
    const targetX = caster.posX + moveDelta.dx;
    const targetY = caster.posY + moveDelta.dy;

    if (targetX < 0 || targetX >= MAP_WIDTH || targetY < 0 || targetY >= MAP_HEIGHT) {
        logToBattleLog("맵 경계를 벗어날 수 없습니다."); return;
    }
    if (characterPositions[`${targetX},${targetY}`] && characterPositions[`${targetX},${targetY}`] !== caster.id) {
         logToBattleLog("다른 캐릭터가 있는 곳으로 이동할 수 없습니다."); return;
    }
    
    selectedAction.type = 'move';
    selectedAction.skillId = null;
    selectedAction.targetId = null;
    selectedAction.subTargetId = null;
    selectedAction.moveDelta = moveDelta;
    
    logToBattleLog(`${caster.name}이(가) (${targetX}, ${targetY})로 이동 선택.`);
    selectedTargetName.textContent = `이동 (${targetX},${targetY})`;
    confirmActionButton.style.display = 'block';
    displayCharacters();
}

function selectTarget(targetCharId) {
    if (selectedAction.type !== 'skill' || !selectedAction.skillId) return;

    const caster = findCharacterById(selectedAction.casterId);
    const skill = SKILLS[selectedAction.skillId];
    const targetChar = findCharacterById(targetCharId);

    if (!targetChar || !targetChar.isAlive) { alert('유효한 대상을 선택해 주세요!'); return; }

    let canConfirm = false;
    if (skill.targetSelection === 'enemy') {
        if (enemyCharacters.includes(targetChar)) {
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            canConfirm = true;
        } else alert('적군을 대상으로 선택해야 합니다.');
    } else if (skill.targetSelection === 'ally') {
        if (allyCharacters.includes(targetChar)) {
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            canConfirm = true;
        } else alert('아군을 대상으로 선택해야 합니다.');
    } else if (skill.targetSelection === 'ally_or_self') {
        if (allyCharacters.includes(targetChar) || caster.id === targetCharId) {
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            canConfirm = true;
        } else alert('아군 또는 자신을 대상으로 선택해야 합니다.');
    } else if (skill.targetSelection === 'two_enemies') {
        if (!enemyCharacters.includes(targetChar)) { alert('적군을 선택해야 합니다.'); return; }
        if (!selectedAction.targetId) { 
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            logToBattleLog(`[${skill.name}] 첫 번째 대상: ${targetChar.name}. 두 번째 대상 선택.`);
        } else if (selectedAction.targetId !== targetCharId) { 
            selectedAction.subTargetId = targetCharId;
            const mainTargetName = findCharacterById(selectedAction.targetId).name;
            selectedTargetName.textContent = `${mainTargetName}, ${targetChar.name}`;
            canConfirm = true;
        } else alert('첫 번째 대상과 다른 대상을 선택해 주세요.');
    }

    confirmActionButton.style.display = canConfirm ? 'block' : 'none';
    displayCharacters();
}

function confirmAction() {
    if (!selectedAction.type) { alert('행동을 선택해 주세요.'); return; }

    const caster = findCharacterById(selectedAction.casterId);
    if (!caster) { alert('시전자를 찾을 수 없습니다.'); return; }

    let actionDetails = { caster: caster, type: selectedAction.type };

    if (selectedAction.type === 'skill') {
        const skill = SKILLS[selectedAction.skillId];
        if (!skill) { alert('선택된 스킬 정보를 찾을 수 없습니다.'); return; }
        actionDetails.skill = skill;
        
        if (skill.targetSelection !== 'all_allies' && skill.targetSelection !== 'all_enemies' && skill.targetSelection !== 'self') {
             actionDetails.mainTarget = findCharacterById(selectedAction.targetId);
             if (skill.targetSelection === 'two_enemies') {
                 actionDetails.subTarget = findCharacterById(selectedAction.subTargetId);
                 if (!actionDetails.subTarget) { alert('두 번째 대상을 찾을 수 없습니다.'); return; }
             }
             if (!actionDetails.mainTarget && skill.targetSelection !== 'self') { 
                 alert('주요 대상을 찾을 수 없습니다.'); return;
             }
        } else if (skill.targetSelection === 'self') {
            actionDetails.mainTarget = caster; 
        }
        logToBattleLog(`✅ ${caster.name}의 스킬: [${skill.name}] 대기열 추가.`);
    } else if (selectedAction.type === 'move') {
        actionDetails.moveDelta = selectedAction.moveDelta;
        logToBattleLog(`✅ ${caster.name}의 이동: 대기열 추가.`);
    }

    playerActionsQueue.push(actionDetails);
    currentActingCharacterIndex++;
    showSkillSelectionForNextAlly();
}

async function executeSingleAction(action) {
    const caster = action.caster;
    if (!caster || !caster.isAlive) {
        console.log(`[DEBUG] executeSingleAction: Caster ${caster ? caster.name : 'N/A'} is not alive or not found. Returning.`);
        return; // 여기서 반환하면 executeBattleTurn의 루프가 다음 action으로 넘어가지 않을 수 있으니 주의.
                // 이 경우는 보통 문제가 없지만, 만약 캐릭터가 중간에 죽고 이 조건에 걸리면
                // false를 반환하지 않아 루프가 돌지 않을 수 있습니다.
                // 다만, 현재 문제는 첫 캐릭터 행동 후 멈추는 것이므로, 이 부분은 나중 문제일 수 있습니다.
    }

    applyTurnStartEffects(caster);

    logToBattleLog(`\n--- ${caster.name}의 행동 (${currentTurn} 턴) ---`);

    if (action.type === 'skill') {
        const skill = action.skill;
        logToBattleLog(`${caster.name}이(가) [${skill.name}]을 사용합니다!`);
        let skillSuccess = true;
        if (skill.execute) {
            let mainTarget = action.mainTarget;
            let subTarget = action.subTarget;
            let actualAllies = allyCharacters.filter(a => a.isAlive);
            let actualEnemies = enemyCharacters.filter(e => e.isAlive);

            console.log(`[DEBUG] executeSingleAction: Attempting to execute skill: ${skill.name} by ${caster.name}`); // 스킬 실행 직전 로그

            if (skill.id === SKILLS.SKILL_TRUTH.id) {
                skillSuccess = skill.execute(caster, actualEnemies, logToBattleLog);
            } else if (skill.targetType === 'all_allies'){
                skillSuccess = skill.execute(caster, actualAllies, actualEnemies, logToBattleLog);
            } else {
                skillSuccess = skill.execute(caster, mainTarget, subTarget, actualAllies, actualEnemies, logToBattleLog);
            }
            console.log(`[DEBUG] executeSingleAction: Skill ${skill.name} execution finished. skillSuccess = ${skillSuccess}`); // 스킬 실행 직후 결과 로그
        }

        if (skillSuccess === false) {
            logToBattleLog(`${skill.name} 사용에 실패했습니다.`);
        } else {
            caster.lastSkillTurn[skill.id] = currentTurn;
        }

    } else if (action.type === 'move') {
        const oldX = caster.posX; const oldY = caster.posY;
        const newX = caster.posX + action.moveDelta.dx;
        const newY = caster.posY + action.moveDelta.dy;

        if (oldX !== -1 && oldY !== -1) delete characterPositions[`${oldX},${oldY}`];
        caster.posX = newX; caster.posY = newY;
        characterPositions[`${newX},${newY}`] = caster.id;
        logToBattleLog(`${caster.name}이(가) (${oldX},${oldY})에서 (${newX},${newY})로 이동. 턴 종료.`);
        console.log(`[DEBUG] executeSingleAction: Character ${caster.name} moved.`); // 이동 후 로그
    }

    processEndOfTurnEffects(caster);
    displayCharacters();

    console.log(`[DEBUG] executeSingleAction: About to call checkBattleEnd() for ${caster.name}.`); // checkBattleEnd 호출 직전 로그
    if (checkBattleEnd()) {
        console.log(`[DEBUG] executeSingleAction: checkBattleEnd() returned true for ${caster.name}. Battle ends. Returning true.`); // checkBattleEnd가 true 반환 시 로그
        return true;
    }

    console.log(`[DEBUG] executeSingleAction: Action for ${caster.name} completed. Returning false to continue turn sequence.`); // 함수가 false 반환하기 직전 로그
    return false;
}

async function executeBattleTurn() {
    if (!isBattleStarted) { alert('전투를 시작해 주세요.'); return; }
    if (playerActionsQueue.length === 0 && currentActingCharacterIndex < allyCharacters.filter(c=>c.isAlive).length ) {
        alert('모든 아군의 행동을 선택하거나, 현재 행동 중인 아군의 행동을 확정해 주세요.');
        return;
    }
    logToBattleLog(`\n--- ${currentTurn} 턴 아군 행동 실행 ---`);
    skillSelectionArea.style.display = 'none';

    console.log(`[DEBUG] executeBattleTurn: Starting ally actions. Queue length: ${playerActionsQueue.length}`); // 아군 행동 루프 시작 로그

    for (const action of playerActionsQueue) {
        console.log(`[DEBUG] executeBattleTurn: Processing action for ${action.caster.name}, type: ${action.type}`); // 각 행동 처리 시작 로그
        if (await executeSingleAction(action)) {
            console.log(`[DEBUG] executeBattleTurn: executeSingleAction returned true. Battle ending.Ally actions loop will break.`); // executeSingleAction이 true 반환 시 로그
            return;
        }
        console.log(`[DEBUG] executeBattleTurn: Action processed for ${action.caster.name}. Continuing to next action if any.`); // 각 행동 처리 완료 후 루프 계속될 때 로그
    }

    console.log(`[DEBUG] executeBattleTurn: All ally actions processed. Starting enemy actions.`); // 적군 행동 루프 시작 전 로그

    logToBattleLog(`\n--- ${currentTurn} 턴 적군 행동 실행 ---`);
    for (const enemyChar of enemyCharacters) {
        if (enemyChar.isAlive) {
            console.log(`[DEBUG] executeBattleTurn: Processing action for enemy ${enemyChar.name}`); // 각 적군 행동 처리 시작 로그
            if (await performEnemyAction(enemyChar)) {
                console.log(`[DEBUG] executeBattleTurn: performEnemyAction returned true. Battle ending. Enemy actions loop will break.`); // performEnemyAction이 true 반환 시 로그
                return;
            }
        }
    }

    console.log(`[DEBUG] executeBattleTurn: All enemy actions processed. Preparing for next turn.`); // 다음 턴 준비 전 로그

    playerActionsQueue = [];
    if (!checkBattleEnd() && isBattleStarted) {
        prepareNextTurn();
    } else {
        console.log(`[DEBUG] executeBattleTurn: Battle ended or not started. currentTurn: ${currentTurn}, isBattleStarted: ${isBattleStarted}`); // 다음 턴 준비 안 할 경우 로그
    }
}

async function executeBattleTurn() {
    console.log(`[DEBUG] executeBattleTurn: Starting turn ${currentTurn}. Player actions in queue: ${playerActionsQueue.length}`);

    skillSelectionArea.style.display = 'none';
    // executeTurnButton.disabled = true; // 턴 실행 중 버튼 비활성화 고려
    // nextTurnButton.style.display = 'none'; // 턴 실행 중 다음 턴 버튼 숨김

    logToBattleLog(`\n--- ${currentTurn} 턴 아군 행동 실행 ---`);
    for (const action of playerActionsQueue) {
        console.log(`[DEBUG] executeBattleTurn: Ally action for ${action.caster.name}`);
        if (await executeSingleAction(action)) {
            console.log(`[DEBUG] executeBattleTurn: Battle ended during ally turn.`);
            // executeTurnButton.disabled = false; // 버튼 상태 복원
            return; // 전투 종료
        }
    }
    console.log(`[DEBUG] executeBattleTurn: All ally actions completed for turn ${currentTurn}.`);

    logToBattleLog(`\n--- ${currentTurn} 턴 적군 행동 실행 ---`);
    for (const enemyChar of enemyCharacters) {
        if (enemyChar.isAlive) {
            console.log(`[DEBUG] executeBattleTurn: Enemy action for ${enemyChar.name}`);
            if (await performEnemyAction(enemyChar)) {
                console.log(`[DEBUG] executeBattleTurn: Battle ended during enemy turn.`);
                // executeTurnButton.disabled = false; // 버튼 상태 복원
                return; // 전투 종료
            }
        }
    }
    console.log(`[DEBUG] executeBattleTurn: All enemy actions completed for turn ${currentTurn}.`);

    // 중요: playerActionsQueue는 prepareNextTurn에서 currentActingCharacterIndex와 함께 초기화되므로,
    // 여기서 비우는 것보다 prepareNextTurn이 확실히 호출되게 하는 것이 중요.
    // playerActionsQueue = []; // 이 줄은 prepareNextTurn에서 처리하므로 여기서 중복 필요 없음.

    console.log(`[DEBUG] executeBattleTurn: End of turn ${currentTurn}. About to check conditions for prepareNextTurn.`);
    if (!checkBattleEnd() && isBattleStarted) {
        console.log(`[DEBUG] executeBattleTurn: Preparing next turn.`);
        prepareNextTurn(); // 여기가 호출되어야 다음 턴 UI가 나옴
    } else {
        console.log(`[DEBUG] executeBattleTurn: Battle ended or not started. Not preparing next turn. isBattleStarted: ${isBattleStarted}`);
        // 전투 종료 시 UI 정리 (endBattle 함수에서 처리)
        // executeTurnButton.disabled = false; // 필요하면 버튼 상태 복원
        // startButton.style.display = 'block'; // 예시
    }
}

    if (!isBattleStarted) { alert('전투를 시작해 주세요.'); return; }
    if (playerActionsQueue.length === 0 && currentActingCharacterIndex < allyCharacters.filter(c=>c.isAlive).length ) {
        alert('모든 아군의 행동을 선택하거나, 현재 행동 중인 아군의 행동을 확정해 주세요.');
        return;
    }
    logToBattleLog(`\n--- ${currentTurn} 턴 아군 행동 실행 ---`);
    skillSelectionArea.style.display = 'none'; 

    for (const action of playerActionsQueue) {
        if (await executeSingleAction(action)) return; 
    }

    logToBattleLog(`\n--- ${currentTurn} 턴 적군 행동 실행 ---`);
    for (const enemyChar of enemyCharacters) {
        if (enemyChar.isAlive) {
            if (await performEnemyAction(enemyChar)) return; 
        }
    }

    playerActionsQueue = [];
    if (!checkBattleEnd() && isBattleStarted) { 
        prepareNextTurn();
    }
}

async function performEnemyAction(enemyChar) {
    applyTurnStartEffects(enemyChar); 
    logToBattleLog(`\n--- ${enemyChar.name}의 행동 (${currentTurn} 턴) ---`);

    let targetAlly = null;
    const provokeDebuff = enemyChar.debuffs.find(d => d.id === 'provoked' && d.turnsLeft > 0);
    if (provokeDebuff) {
        targetAlly = findCharacterById(provokeDebuff.effect.targetId);
        if (!targetAlly || !targetAlly.isAlive) targetAlly = null; 
    }

    if (!targetAlly) {
        const aliveAllies = allyCharacters.filter(a => a.isAlive);
        if (aliveAllies.length > 0) {
            targetAlly = aliveAllies.reduce((min, char) => (char.currentHp < min.currentHp ? char : min), aliveAllies[0]);
        }
    }

    if (targetAlly) {
        const usableSkills = enemyChar.skills.map(id => SKILLS[id]).filter(s => s); 
        let skillToUse = null;
        if (usableSkills.length > 0) skillToUse = usableSkills[Math.floor(Math.random() * usableSkills.length)]; 

        if (skillToUse) {
            logToBattleLog(`${enemyChar.name}이(가) ${targetAlly.name}에게 [${skillToUse.name}] 사용!`);
            // Simplified enemy skill execution
             let actualAllies = allyCharacters.filter(a => a.isAlive);
             let actualEnemies = enemyCharacters.filter(e => e.isAlive);

            if (skillToUse.targetType === "single_enemy") { 
                skillToUse.execute(enemyChar, targetAlly, null, actualAllies, actualEnemies, logToBattleLog);
            } else if (skillToUse.targetType === "self") {
                skillToUse.execute(enemyChar, enemyChar, null, actualAllies, actualEnemies, logToBattleLog);
            } else if (skillToUse.targetType === "all_allies") { // Enemy's "all_allies" targets player characters
                skillToUse.execute(enemyChar, actualAllies, actualEnemies, logToBattleLog);
            } else if (skillToUse.targetType === "all_enemies") { // Enemy's "all_enemies" targets its own team (other enemies)
                 skillToUse.execute(enemyChar, actualEnemies, logToBattleLog); // Assuming truth-like signature
            }
            else { 
                logToBattleLog(`${enemyChar.name}의 [${skillToUse.name}] 스킬 대상 타입(${skillToUse.targetType}) 자동 실행 미지원. 기본 공격으로 대체.`);
                const damage = calculateDamage(enemyChar, targetAlly, 1.0, 'physical'); 
                targetAlly.takeDamage(damage, logToBattleLog, enemyChar);
            }
        } else { 
            logToBattleLog(`${enemyChar.name}이(가) ${targetAlly.name}에게 기본 공격!`);
            const damage = calculateDamage(enemyChar, targetAlly, 1.0, 'physical');
            targetAlly.takeDamage(damage, logToBattleLog, enemyChar);
        }
    } else {
        logToBattleLog(`${enemyChar.name}이(가) 공격할 대상이 없습니다.`);
    }
    processEndOfTurnEffects(enemyChar);
    displayCharacters();
    return checkBattleEnd(); 
}

function checkBattleEnd() {
    const allEnemiesDead = enemyCharacters.every(char => !char.isAlive);
    const allAlliesDead = allyCharacters.every(char => !char.isAlive);

    console.log(`[DEBUG] checkBattleEnd: allEnemiesDead=${allEnemiesDead} (Total: ${enemyCharacters.length}), allAlliesDead=${allAlliesDead} (Total: ${allyCharacters.length})`);
    
    if (allEnemiesDead && enemyCharacters.length > 0) { 
        logToBattleLog('--- 모든 적을 물리쳤습니다. 전투 승리! 🎉 ---');
        endBattle();
        return true;
    } else if (allAlliesDead && allyCharacters.length > 0) { 
        logToBattleLog('--- 모든 아군이 쓰러졌습니다. 전투 패배! 😭 ---');
        endBattle();
        return true;
    }
    return false;
}

function endBattle() {
    isBattleStarted = false;
    startButton.style.display = 'block';
    nextTurnButton.style.display = 'none';
    executeTurnButton.style.display = 'none';
    skillSelectionArea.style.display = 'none';
 
}

function findCharacterById(id) {
    return [...allyCharacters, ...enemyCharacters].find(char => char.id === id);
}


// --- 6. 페이지 로드 시 초기화 ---
document.addEventListener('DOMContentLoaded', () => {
    const char1 = new Character("파투투", "야수", 90);
    const char2 = new Character("튜즈데이", "천체");
    const char3 = new Character("이졸데", "나무");
    allyCharacters.push(char1, char2, char3);

    const enemy1 = new Character("우어어", "야수");
    const enemy2 = new Character("우아아", "암석");
    enemyCharacters.push(enemy1, enemy2);
    
    allyCharacters.forEach(char => {
        const cell = getRandomEmptyCell();
        if (cell) { char.posX = cell.x; char.posY = cell.y; characterPositions[`${cell.x},${cell.y}`] = char.id;}
    });
    enemyCharacters.forEach(char => {
        const cell = getRandomEmptyCell();
        if (cell) { char.posX = cell.x; char.posY = cell.y; characterPositions[`${cell.x},${cell.y}`] = char.id;}
    });

    displayCharacters();

});
