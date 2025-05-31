// --- 상수 정의 ---

// 위치 정의
const MAP_WIDTH = 5;
const MAP_HEIGHT = 5;

// 스킬 데이터 정의
const SKILLS = {
    // [근성]
    SKILL_RESILIENCE: {
        id: "SKILL_RESILIENCE",
        name: "근성",
        type: "어그로", // 스킬 유형을 더 구체적으로 정의
        description: "자신에게 현재 체력의 2.5배 보호막 부여. 해당 턴에 발생한 모든 아군의 감소한 체력을 대신 감소.",
        targetType: "self", // 스킬 대상 타입: 자신
        execute: (caster, allies, enemies, battleLog) => {
            const shieldAmount = caster.currentHp * 2.5;
            caster.shield += shieldAmount;
            battleLog(`🛡️ ${caster.name}이(가) [근성]을 사용하여 ${shieldAmount.toFixed(0)}의 보호막을 얻었습니다! (현재 보호막: ${caster.shield.toFixed(0)})`);
            caster.aggroDamageStored = 0; // 해당 턴에 발생할 피해를 저장할 변수 초기화
            // '대신 감소' 로직은 피해 발생 시점에서 처리되므로 여기에 직접적인 HP 감소는 없음.
        }
    },
    // [반격]
    SKILL_COUNTER: {
        id: "SKILL_COUNTER",
        name: "반격",
        type: "카운터",
        description: "자신이 지닌 보호막을 모든 아군에게 균등하게 나눔. 해당 턴에 자신이 공격받은 후, 모든 적군에게 (받는 피해)x1.2 피해. 아군이 공격받은 후, 모든 적군에게 (받는 피해)x0.5 피해.",
        targetType: "all_allies", // 보호막 분배 대상: 모든 아군
        execute: (caster, allies, enemies, battleLog) => {
            if (caster.shield > 0) {
                const liveAllies = allies.filter(a => a.isAlive);
                if (liveAllies.length > 0) {
                    const shieldPerAlly = caster.shield / liveAllies.length;
                    liveAllies.forEach(ally => {
                        ally.shield += shieldPerAlly;
                        battleLog(`✨ ${caster.name}이(가) [반격]을 사용하여 ${ally.name}에게 ${shieldPerAlly.toFixed(0)}의 보호막을 나누어 주었습니다. (총 ${ally.shield.toFixed(0)})`);
                    });
                    caster.shield = 0; // 보호막 모두 소진
                } else {
                    battleLog(`✨ ${caster.name}이(가) [반격]을 사용했지만 아군이 없어 보호막을 나눌 수 없습니다.`);
                }
            } else {
                battleLog(`✨ ${caster.name}이(가) [반격]을 사용했지만 보호막이 없어 나눌 수 없습니다.`);
            }
            // 피해 반사 로직은 Character의 takeDamage 함수에서 처리해야 함.
        }
    },
    // [도발]
    SKILL_PROVOKE: {
        id: "SKILL_PROVOKE",
        name: "도발",
        type: "어그로",
        description: "해당 턴에 자신의 받는 피해 0.3으로 감소. 다음 적군 턴 동안 모든 적군은 자신만을 대상으로 공격. 해당 턴에 자신의 감소한 체력 총합 저장.",
        targetType: "self",
        execute: (caster, allies, enemies, battleLog) => {
            // 피해 감소 버프 추가 (일단은 턴 종료 시까지 유지)
            caster.addBuff('provoke_damage_reduction', '피해 감소 (도발)', 1, { damageReduction: 0.7 }); // 0.3으로 감소 = 70% 감소
            // 도발 디버프 추가 (적군에게 다음 턴까지 유지)
            enemies.filter(e => e.isAlive).forEach(enemy => {
                enemy.addDebuff('provoked', '도발 (타겟 고정)', 2, { target: caster.id }); // 다음 적군 턴까지 (2턴)
            });
            caster.aggroDamageStored = 0; // 해당 턴 저장 피해 초기화
            battleLog(`🎯 ${caster.name}이(가) [도발]을 사용하여 받는 피해가 감소하고 모든 적군이 ${caster.name}을(를) 공격하도록 도발했습니다.`);
        }
    },
    // [역습]
    SKILL_REVERSAL: {
        id: "SKILL_REVERSAL",
        name: "역습",
        type: "카운터",
        description: "자신의 현재 체력 0.5로 감소. 해당 턴에 자신이 공격받은 후, 홀수 턴에는 (공격력 + [도발] 저장 피해)x1.5 물리 피해, 짝수 턴에는 (마법 공격력 + [도발] 저장 피해)x1.5 마법 피해를 공격한 적군에게 줌. 반격 후, 도발 저장량 초기화.",
        targetType: "self", // 스킬 사용 대상은 자신이지만, 피해는 공격한 적에게.
        execute: (caster, allies, enemies, battleLog) => {
            const hpLoss = caster.currentHp * 0.5;
            caster.currentHp -= hpLoss;
            if (caster.currentHp < 1) caster.currentHp = 1; // 최소 체력 1
            battleLog(`💥 ${caster.name}이(가) [역습]을 사용하여 체력을 ${hpLoss.toFixed(0)} 잃고 ${caster.currentHp.toFixed(0)}이 되었습니다.`);
            // 역습 반격 로직은 Character의 takeDamage 함수에서 처리
            caster.addBuff('reversal_active', '역습 대기', 1, {}); // 이번 턴 동안 역습 대기 상태
        }
    },
    // [허상]
    SKILL_ILLUSION: {
        id: "SKILL_ILLUSION",
        name: "허상",
        type: "지정 버프",
        description: "단일 강화. 자신에게 사용 시 (공격)x0.5 체력 회복. 다른 아군에게 사용 시 자신의 (공격)x0.2 체력 잃고 아군 (공격)x2.0 증가(2턴). 턴 종료 시 목표 적군에게 (공격)x0.5 추가 공격.",
        targetType: "single_ally_or_self",
        targetSelection: "ally_or_self", // UI에서 선택 가능
        execute: (caster, target, allies, enemies, battleLog) => {
            if (caster.id === target.id) { // 자신에게 사용
                const healAmount = caster.atk * 0.5;
                caster.currentHp = Math.min(caster.maxHp, caster.currentHp + healAmount);
                battleLog(`💖 ${caster.name}이(가) [허상]을 자신에게 사용하여 ${healAmount.toFixed(0)}의 체력을 회복했습니다. (${caster.currentHp.toFixed(0)} HP)`);
            } else { // 다른 아군에게 사용
                const hpLoss = caster.atk * 0.2;
                caster.currentHp -= hpLoss;
                if (caster.currentHp < 1) caster.currentHp = 1;
                battleLog(`💔 ${caster.name}이(가) [허상]을 ${target.name}에게 사용하여 ${hpLoss.toFixed(0)}의 체력을 잃었습니다. (${caster.currentHp.toFixed(0)} HP)`);
                target.addBuff('illusion_atk_boost', '공격력 증가 (허상)', 2, { atkBoost: 2.0 });
                battleLog(`💪 ${target.name}의 공격력이 2배 증가했습니다! (2턴)`);
            }
            // 턴 종료 시 추가 공격 로직은 별도로 관리
            caster.addBuff('illusion_end_turn_attack', '턴 종료 추가 공격 (허상)', 1, { attacker: caster.id, target: target.id }); // 어떤 대상에게 추가 공격을 할지 저장
        }
    },
    // [허무]
    SKILL_NIHILITY: {
        id: "SKILL_NIHILITY",
        name: "허무",
        type: "지정 버프",
        description: "단일 강화. 목표 아군의 [상태 이상], [제어], [속성 감소] 랜덤 2개 정화. [버프 집합] 중 랜덤 1개 부여(2턴).",
        targetType: "single_ally",
        targetSelection: "ally", // UI에서 선택 가능
        execute: (caster, target, allies, enemies, battleLog) => {
            const removableDebuffs = target.debuffs.filter(d => ['상태 이상', '제어', '속성 감소'].includes(d.category)); // 예시: 디버프 카테고리 추가 필요
            if (removableDebuffs.length > 0) {
                // 랜덤으로 2개 정화 (또는 가능한 만큼)
                for (let i = 0; i < Math.min(2, removableDebuffs.length); i++) {
                    const debuffToRemove = removableDebuffs[Math.floor(Math.random() * removableDebuffs.length)];
                    target.removeDebuff(debuffToRemove.id);
                    battleLog(`✨ ${target.name}의 [${debuffToRemove.name}] 디버프가 정화되었습니다.`);
                    // 제거된 디버프는 배열에서 빼기
                    removableDebuffs.splice(removableDebuffs.indexOf(debuffToRemove), 1);
                }
            } else {
                battleLog(`✨ ${target.name}에게 정화할 디버프가 없습니다.`);
            }

            const buffChoices = [
                { name: '턴 시작 시 HP 회복 (허무)', turns: 2, effect: { type: 'turn_start_heal', value: caster.atk * 0.5 } },
                { name: '피해 반사 (허무)', turns: 2, effect: { type: 'damage_reflect', value: 0.3 } },
                { name: '방어력 증가 (허무)', turns: 2, effect: { type: 'def_boost', value: 0.3 } },
                { name: '공격력 증가 (허무)', turns: 2, effect: { type: 'atk_boost', value: 1.5 } }
            ];
            const chosenBuff = buffChoices[Math.floor(Math.random() * buffChoices.length)];
            target.addBuff(chosenBuff.name, chosenBuff.name, chosenBuff.turns, chosenBuff.effect); // ID는 나중에 수정
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
        execute: (caster, allies, enemies, battleLog) => {
            const currentTurnNum = currentTurn; // 현재 턴 번호
            const lastUsedTurn = caster.lastSkillTurn[SKILLS.SKILL_REALITY.id] || 0;

            if (currentTurnNum - lastUsedTurn <= 2 && lastUsedTurn !== 0) { // 3턴 연속 사용 불가 (현재 턴 - 마지막 사용 턴 <= 2)
                battleLog(`❌ ${caster.name}은(는) [실존]을 ${3 - (currentTurnNum - lastUsedTurn)}턴 동안 사용할 수 없습니다. (연속 사용 제한)`);
                return false; // 스킬 사용 실패
            }

            allies.filter(a => a.isAlive).forEach(ally => {
                ally.addBuff('reality_def_boost', '방어력 증가 (실존)', 2, { defBoost: 0.3 });
            });
            battleLog(`🛡️ 모든 아군의 방어력이 30% 증가했습니다! (2턴)`);

            let realityStacks = 4;
            if (lastUsedTurn === currentTurnNum - 1) { // 직전 턴에 사용했으면 연속 사용
                realityStacks += 2;
                battleLog(`✨ [실존] 연속 사용으로 ${caster.name}이(가) [실재] ${realityStacks}스택을 추가 획득했습니다!`);
            } else {
                battleLog(`✨ ${caster.name}이(가) [실재] ${realityStacks}스택을 추가 획득했습니다!`);
            }

            // 실재 버프 (해제 불가)
            caster.addBuff('reality_stacks', '실재', 2, { atkBoostPerStack: 0.4, stacks: realityStacks, unremovable: true });

            caster.lastSkillTurn[SKILLS.SKILL_REALITY.id] = currentTurnNum; // 마지막 사용 턴 기록
            return true; // 스킬 사용 성공
        }
    },
    // [진리]
    SKILL_TRUTH: {
        id: "SKILL_TRUTH",
        name: "진리",
        type: "광역 디버프",
        description: "모든 적군에게 2턴 동안 [중독] 상태 부여 (턴 종료 시 사용자의 공격력 x0.5 고정 피해). 중독 결산 후 랜덤 적군에게 사용자의 공격력 x0.3 추가 공격 부여.",
        targetType: "all_enemies",
        execute: (caster, enemies, battleLog) => {
            enemies.filter(e => e.isAlive).forEach(enemy => {
                enemy.addDebuff('poison', '중독', 2, { damagePerTurn: caster.atk * 0.5, type: 'fixed' });
                battleLog(`☠️ ${enemy.name}이(가) [중독] 상태에 빠졌습니다! (2턴)`);
            });
            // 중독 결산 후 추가 공격은 턴 종료 시점에서 처리
        }
    },
    // [서막]
    SKILL_OVERTURE: {
        id: "SKILL_OVERTURE",
        name: "서막",
        type: "단일 공격",
        description: "공격력 200% 물리 피해/마법 공격력 250% 마법 피해를 가하고 상대에게 [흠집]을 새긴다. [흠집]: 기본 2턴, 중첩 시 마지막 흠집 유지 시간에 따름. 3회까지 중첩. 추가 공격 이후 사라짐.",
        targetType: "single_enemy",
        targetSelection: "enemy", // UI에서 선택 가능
        execute: (caster, target, allies, enemies, battleLog) => {
            const damageType = caster.atk > caster.matk ? 'physical' : 'magical'; // 공격력 높은 쪽으로 공격
            const skillPower = damageType === 'physical' ? 2.0 : 2.5;
            const damage = calculateDamage(caster, target, skillPower, damageType);
            target.takeDamage(damage, battleLog, caster);
            battleLog(`⚔️ ${caster.name}이(가) [서막]으로 ${target.name}에게 ${damage.toFixed(0)}의 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다!`);

            // [흠집] 부여
            target.addDebuff('scratch', '흠집', 2, { maxStacks: 3, overrideDuration: true, remover: '절정' }); // 절정이 제거한다는 속성
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
        targetSelection: "enemy", // UI에서 선택 가능
        execute: (caster, target, allies, enemies, battleLog) => {
            const damageType = caster.atk > caster.matk ? 'physical' : 'magical';
            const skillPower = damageType === 'physical' ? 2.7 : 3.1;

            // 3타 공격
            for (let i = 0; i < 3; i++) {
                const damage = calculateDamage(caster, target, skillPower / 3, damageType); // 3타로 나누어 계산
                target.takeDamage(damage, battleLog, caster);
                battleLog(`⚔️ ${caster.name}이(가) [절정]으로 ${target.name}에게 ${damage.toFixed(0)}의 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다! (${i + 1}타)`);
                if (!target.isAlive) break; // 중간에 죽으면 중단
            }

            // [흠집] 추가 공격
            const scratchStacks = target.getDebuffStacks('scratch');
            if (scratchStacks > 0) {
                let bonusSkillPower = 0;
                if (scratchStacks === 1) bonusSkillPower = damageType === 'physical' ? 0.25 : 0.30;
                else if (scratchStacks === 2) bonusSkillPower = damageType === 'physical' ? 0.35 : 0.40;
                else if (scratchStacks >= 3) bonusSkillPower = damageType === 'physical' ? 0.45 : 0.50;

                for (let i = 0; i < 2; i++) { // 2회 추가 공격
                    const bonusDamage = calculateDamage(caster, target, bonusSkillPower, damageType);
                    target.takeDamage(bonusDamage, battleLog, caster);
                    battleLog(`💥 [흠집] 효과로 ${caster.name}이(가) ${target.name}에게 ${bonusDamage.toFixed(0)}의 추가 피해를 주었습니다! (${i + 1}회)`);
                    if (!target.isAlive) break;
                }
                target.removeDebuffById('scratch'); // [흠집] 제거
                battleLog(`🩹 ${target.name}의 [흠집]이 사라졌습니다.`);
            }

            // [쇠약] 부여
            target.addDebuff('weakness', '쇠약', 2, { damageReduction: 0.2 });
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
        targetSelection: "enemy", // UI에서 선택 가능
        execute: (caster, target, allies, enemies, battleLog) => {
            const damageType = caster.atk > caster.matk ? 'physical' : 'magical';
            const skillPower1 = damageType === 'physical' ? 1.9 : 2.4;
            const skillPower2 = damageType === 'physical' ? 0.5 : 0.7;

            // 1타
            const damage1 = calculateDamage(caster, target, skillPower1, damageType);
            target.takeDamage(damage1, battleLog, caster);
            battleLog(`⚔️ ${caster.name}이(가) [간파]로 ${target.name}에게 ${damage1.toFixed(0)}의 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다! (1타)`);
            if (!target.isAlive) return;

            // 2타 + 쇠약
            const damage2 = calculateDamage(caster, target, skillPower2, damageType);
            target.takeDamage(damage2, battleLog, caster);
            battleLog(`⚔️ ${caster.name}이(가) [간파]로 ${target.name}에게 ${damage2.toFixed(0)}의 추가 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다! (2타)`);
            
            target.addDebuff('weakness', '쇠약', 2, { damageReduction: 0.2 });
            battleLog(`📉 ${target.name}이(가) [쇠약] 상태에 빠졌습니다! (2턴)`);
        }
    },
    // [파열]
    SKILL_RUPTURE: {
        id: "SKILL_RUPTURE",
        name: "파열",
        type: "광역 공격",
        description: "주 목표에게 공격력 210% 물리/마법 공격력 260% 마법 피해. 부 목표에게 공격력 130% 물리/마법 공격력 180% 마법 피해. [쇠약] 상태 적에게 적중 시 추가 고정 피해 30%.",
        targetType: "multi_enemy", // 여러 적 선택
        targetSelection: "two_enemies", // UI에서 2명 선택
        execute: (caster, mainTarget, subTarget, allies, enemies, battleLog) => {
            const damageType = caster.atk > caster.matk ? 'physical' : 'magical';
            
            // 주 목표 공격
            const mainDamage = calculateDamage(caster, mainTarget, damageType === 'physical' ? 2.1 : 2.6, damageType);
            mainTarget.takeDamage(mainDamage, battleLog, caster);
            battleLog(`💥 ${caster.name}이(가) [파열]로 주 목표 ${mainTarget.name}에게 ${mainDamage.toFixed(0)}의 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다!`);
            if (mainTarget.hasDebuff('weakness')) { // 쇠약 상태 추가 피해
                const bonusDamage = calculateDamage(caster, mainTarget, 0.3, 'fixed'); // 고정 피해
                mainTarget.takeDamage(bonusDamage, battleLog, caster);
                battleLog(`🔥 [쇠약] 상태인 ${mainTarget.name}에게 ${bonusDamage.toFixed(0)}의 추가 고정 피해!`);
            }

            // 부 목표 공격
            if (subTarget && mainTarget.id !== subTarget.id) {
                const subDamage = calculateDamage(caster, subTarget, damageType === 'physical' ? 1.3 : 1.8, damageType);
                subTarget.takeDamage(subDamage, battleLog, caster);
                battleLog(`💥 ${caster.name}이(가) [파열]로 부 목표 ${subTarget.name}에게 ${subDamage.toFixed(0)}의 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다!`);
                if (subTarget.hasDebuff('weakness')) { // 쇠약 상태 추가 피해
                    const bonusDamage = calculateDamage(caster, subTarget, 0.3, 'fixed'); // 고정 피해
                    subTarget.takeDamage(bonusDamage, battleLog, caster);
                    battleLog(`🔥 [쇠약] 상태인 ${subTarget.name}에게 ${bonusDamage.toFixed(0)}의 추가 고정 피해!`);
                }
            }
        }
    }
};

// UI 및 캐릭터 관리 함수 ---

// HTML 요소 가져오기 헬퍼 함수
function getElement(id) {
    return document.getElementById(id);

// --- 스킬 선택 관련 UI 요소 --- (getElement를 사용하도록 수정)
const skillSelectionArea = getElement('skillSelectionArea');
const currentActingCharName = getElement('currentActingCharName');
const availableSkillsDiv = getElement('availableSkills');
const selectedTargetName = getElement('selectedTargetName');
const confirmSkillButton = getElement('confirmSkillButton'); // index.html에서는 confirmActionButton으로 변경 예정이거나, 이 ID를 써야 함
const executeTurnButton = getElement('executeTurnButton');
const startButton = getElement('startButton');
const nextTurnButton = getElement('nextTurnButton');
const battleLogDiv = getElement('battleLog'); // 전투 로그 div
    
// 전투 로그에 메시지 출력
const battleLogDiv = getElement('battleLog');
function logToBattleLog(message) {
    if (battleLogDiv) {
        battleLogDiv.innerHTML += message + '\n';
        battleLogDiv.scrollTop = battleLogDiv.scrollHeight; // 항상 마지막 로그가 보이도록 스크롤
    } else {
        console.log(message); // battleLogDiv가 없을 경우 콘솔에 출력
    }
}

// 캐릭터 추가 함수
function addCharacter(team) {
    const nameInput = getElement('charName');
    const typeInput = getElement('charType');

    const name = nameInput.value.trim();
    const type = typeInput.value;

    if (!name) {
        alert('캐릭터 이름을 입력해 주세요.');
        nameInput.focus();
        return;
    }

    const newChar = new Character(name, type); // Character 클래스는 이미 script.js에 정의되어 있습니다.

    if (team === 'ally') {
        allyCharacters.push(newChar);
        logToBattleLog(`✅ 아군 [${name} (${type})]이(가) 합류했습니다.`);
    } else if (team === 'enemy') {
        enemyCharacters.push(newChar);
        logToBattleLog(`🔥 적군 [${name} (${type})]이(가) 나타났습니다.`);
    } else {
        logToBattleLog('알 수 없는 팀입니다.');
        return;
    }

    displayCharacters(); // 캐릭터 목록 UI 업데이트

    // 입력 필드 초기화 (선택 사항)
    // nameInput.value = (team === 'ally' ? '용사' : '적'); // 기본값으로 다시 설정할 수 있습니다.
}

// 캐릭터 목록 표시 함수
function displayCharacters() {
    const allyDisplay = getElement('allyCharacters');
    const enemyDisplay = getElement('enemyCharacters');

    allyDisplay.innerHTML = ''; // 기존 내용 초기화
    if (allyCharacters.length === 0) {
        allyDisplay.innerHTML = '<p>아군 캐릭터가 없습니다.</p>';
    } else {
        allyCharacters.forEach(char => {
            const charDiv = createCharacterCard(char, 'ally');
            allyDisplay.appendChild(charDiv);
        });
    }

    enemyDisplay.innerHTML = ''; // 기존 내용 초기화
    if (enemyCharacters.length === 0) {
        enemyDisplay.innerHTML = '<p>적군 캐릭터가 없습니다.</p>';
    } else {
        enemyCharacters.forEach(char => {
            const charDiv = createCharacterCard(char, 'enemy');
            enemyDisplay.appendChild(charDiv);
        });
    }

    const mapContainer = getElement('mapGridContainer'); // 'mapGridContainer'는 index.html에 있는 맵 div의 ID입니다.
    if (typeof renderMapGrid === 'function') {
        renderMapGrid(mapContainer, allyCharacters, enemyCharacters);
    } else {
        console.error("renderMapGrid 함수를 찾을 수 없습니다. mapData.js가 올바르게 로드되었는지 확인하세요.");
    }
}

// 캐릭터 카드 생성 함수 (UI 업데이트용)
function createCharacterCard(character, team) {
    const card = document.createElement('div');
    card.className = 'character-stats'; // 기본 카드 스타일
    if (selectedSkillId && SKILLS[selectedSkillId]) { // 스킬 선택 중일 때 대상 강조
        const skillInfo = SKILLS[selectedSkillId];
        if (selectedTargetCharId === character.id || (skillInfo.targetSelection === 'two_enemies' && selectedSubTargetCharId === character.id)) {
            card.classList.add('selected'); // 선택된 대상 스타일
        }
    }

    card.innerHTML = `
        <p><strong>${character.name} (${character.type})</strong></p>
        <p>HP: ${character.currentHp.toFixed(0)} / ${character.maxHp.toFixed(0)} ${character.shield > 0 ? `(+${character.shield.toFixed(0)}🛡️)` : ''}</p>
        <p>공격력: ${character.atk} | 마법 공격력: ${character.matk}</p>
        <p>방어력: ${character.def} | 마법 방어력: ${character.mdef}</p>
        <p>상태: ${character.isAlive ? '생존' : '쓰러짐'}</p>
        ${character.buffs.length > 0 ? `<p>버프: ${character.buffs.map(b => `${b.name}(${b.turnsLeft}턴)`).join(', ')}</p>` : ''}
        ${character.debuffs.length > 0 ? `<p>디버프: ${character.debuffs.map(d => `${d.name}(${d.turnsLeft}턴)`).join(', ')}</p>` : ''}
    `;
    card.onclick = () => {
        if (isBattleStarted && skillSelectionArea.style.display !== 'none') { // 전투 중이고 스킬 선택 창이 활성화되어 있을 때만
            selectTarget(character.id);
        }
    };
    return card;
}


// --- 게임 상태 변수 ---
let allyCharacters = [];
let enemyCharacters = [];
let currentTurn = 0; // 현재 턴 (0부터 시작)
let isBattleStarted = false; // 전투 시작 여부
let autoBattleMode = false; // 자동 전투 모드 여부

let currentActingCharacterIndex = 0; // 현재 행동할 아군 캐릭터의 인덱스
let playerActionsQueue = []; // 플레이어가 선택한 행동 (스킬 사용)을 저장할 큐

// --- 스킬 선택 관련 UI 요소 ---
const skillSelectionArea = getElement('skillSelectionArea');
const currentActingCharName = getElement('currentActingCharName');
const availableSkillsDiv = getElement('availableSkills');
const selectedTargetName = getElement('selectedTargetName');
const confirmSkillButton = getElement('confirmSkillButton');
const executeTurnButton = getElement('executeTurnButton');
const startButton = getElement('startButton');
const nextTurnButton = getElement('nextTurnButton');

let selectedSkillId = null; // 현재 선택된 스킬 ID
let selectedTargetCharId = null; // 현재 선택된 대상 캐릭터 ID
let selectedSubTargetCharId = null; // 파열 같은 스킬의 부 대상 ID

// --- 캐릭터 데이터 모델 수정 (상태 효과 및 스킬 관련 메서드 추가) ---
class Character {
    constructor(name, type) {
        this.id = Math.random().toString(36).substring(2, 11); // 고유 ID 생성
        this.name = name;
        this.type = type;

        // 기본 스탯
        this.atk = 15;
        this.matk = 15;
        this.def = 15;
        this.mdef = 15;

        // 영감에 따른 상성 스탯 적용
        switch (type) {
            case "천체": this.matk = 20; break;
            case "암석": this.def = 20; break;
            case "야수": this.atk = 20; break;
            case "나무": this.mdef = 20; break;
        }

        this.maxHp = 100;
        // currentHp 설정 로직 변경
        this.currentHp = (currentHpOverride !== null && !isNaN(currentHpOverride) && currentHpOverride > 0) ? Math.min(currentHpOverride, this.maxHp) : this.maxHp;
        if (this.currentHp > this.maxHp) this.currentHp = this.maxHp;
        this.isAlive = true;

        // 모든 스킬을 기본으로 가짐 (테스트용)
        this.skills = Object.values(SKILLS).map(skill => skill.id);

        this.buffs = []; // { id, name, turnsLeft, effect, stacks }
        this.debuffs = []; // { id, name, turnsLeft, effect, stacks }

        this.shield = 0;
        this.aggroDamageStored = 0; // [도발] 저장 피해
        this.lastSkillTurn = {}; // 스킬별 마지막 사용 턴 기록 ({ skillId: turnNum })
        this.lastAttackedBy = null; // 마지막으로 자신을 공격한 캐릭터 (반격, 역습용)
        this.currentTurnDamageTaken = 0; // 현재 턴에 받은 피해 (반격, 역습용)
        this.currentTurnAlliesDamageTaken = 0; // 현재 턴에 아군이 받은 총 피해 ([근성]용)

         // 맵 위치 속성 추가
        this.posX = -1; // 초기값 (맵에 배치되지 않음)
        this.posY = -1;
    }

    // 버프 추가
    addBuff(id, name, turns, effect, unremovable = false) {
        let existingBuff = this.buffs.find(b => b.id === id);
        if (existingBuff) {
            existingBuff.turnsLeft = turns; // 턴 갱신
            if (effect.stacks) { // 스택형 버프
                existingBuff.stacks = (existingBuff.stacks || 0) + (effect.stacks || 0);
            }
        } else {
            this.buffs.push({ id, name, turnsLeft: turns, effect, unremovable, stacks: effect.stacks || 1 });
        }
    }

    // 디버프 추가
    addDebuff(id, name, turns, effect) {
        let existingDebuff = this.debuffs.find(d => d.id === id);
        if (existingDebuff) {
            if (effect.overrideDuration) { // 흠집처럼 지속시간 갱신
                existingDebuff.turnsLeft = turns;
            }
            if (effect.maxStacks) { // 스택형 디버프
                existingDebuff.stacks = Math.min(effect.maxStacks, (existingDebuff.stacks || 0) + 1);
            }
        } else {
            this.debuffs.push({ id, name, turnsLeft: turns, effect, stacks: 1 });
        }
    }

    // 특정 디버프 스택 가져오기
    getDebuffStacks(id) {
        const debuff = this.debuffs.find(d => d.id === id);
        return debuff ? debuff.stacks : 0;
    }

    // 특정 버프/디버프가 있는지 확인
    hasBuff(id) {
        return this.buffs.some(b => b.id === id && b.turnsLeft > 0);
    }
    hasDebuff(id) {
        return this.debuffs.some(d => d.id === id && d.turnsLeft > 0);
    }

    // ID로 버프 제거
    removeBuffById(id) {
        this.buffs = this.buffs.filter(b => b.id !== id);
    }
    // ID로 디버프 제거
    removeDebuffById(id) {
        this.debuffs = this.debuffs.filter(d => d.id !== id);
    }


    // 캐릭터가 피해를 입었을 때 처리하는 함수
    takeDamage(rawDamage, battleLog, attacker = null) {
        let finalDamage = rawDamage;
        const initialHp = this.currentHp;

        // [도발]의 피해 감소 효과 적용
        const provokeReduction = this.buffs.find(b => b.id === 'provoke_damage_reduction');
        if (provokeReduction && provokeReduction.turnsLeft > 0) {
            finalDamage *= (1 - provokeReduction.effect.damageReduction);
            battleLog(`🛡️ ${this.name}은(는) [도발] 효과로 ${rawDamage.toFixed(0)}의 피해를 ${finalDamage.toFixed(0)}으로 감소시켰습니다.`);
        }

        // 보호막부터 깎기
        if (this.shield > 0) {
            const damageToShield = Math.min(finalDamage, this.shield);
            this.shield -= damageToShield;
            finalDamage -= damageToShield;
            battleLog(`🛡️ ${this.name}의 보호막이 ${damageToShield.toFixed(0)}만큼 피해를 흡수했습니다. (남은 보호막: ${this.shield.toFixed(0)})`);
        }
        
        // 체력 감소
        this.currentHp -= finalDamage;
        if (this.currentHp <= 0) {
            this.currentHp = 0;
            this.isAlive = false;
        }

        const actualDamageTaken = initialHp - this.currentHp;
        this.currentTurnDamageTaken += actualDamageTaken; // 현재 턴에 받은 총 피해 누적

        // [근성] 스킬의 '대신 감소' 로직
        const resilienceCaster = allyCharacters.find(char => char.id === this.id && char.hasBuff('resilience_active')); // 가상의 버프 ID
        if (resilienceCaster) { // 근성 사용자가 나 자신일 때
            const totalAlliesDamage = allyCharacters.filter(a => a.isAlive).reduce((sum, ally) => sum + ally.currentTurnDamageTaken, 0);
            const damageToTake = totalAlliesDamage - resilienceCaster.aggroDamageStored; // 새로 발생한 아군 피해
            if (damageToTake > 0) {
                battleLog(`💔 [근성] 효과로 ${resilienceCaster.name}이(가) 아군을 대신하여 ${damageToTake.toFixed(0)}의 피해를 추가로 받습니다.`);
                resilienceCaster.takeDamage(damageToTake, battleLog); // 재귀 호출
                resilienceCaster.aggroDamageStored = totalAlliesDamage;
            }
        } else { // 다른 아군이 피해를 입었을 때, [근성] 사용자에게 전달
            const activeResilienceUser = allyCharacters.find(char => char.hasBuff('resilience_active'));
            if (activeResilienceUser && this.id !== activeResilienceUser.id) { // 내가 근성 사용자가 아니고, 근성 사용자가 있다면
                // 이 부분은 복잡하므로, 일단은 '대신 감소' 로직을 간단하게 처리하거나,
                // 스킬 execute 함수에서 해당 턴에 발생한 모든 아군 피해를 추적하는 방식으로 구현해야 합니다.
                // 여기서는 Character 클래스에 currentTurnAlliesDamageTaken을 추가하여 누적하도록 변경했습니다.
            }
        }


        // [반격] 처리 (자신이 공격받았을 때)
        if (attacker && this.hasBuff('counter_active')) { // 가상의 버프 ID
            const counterDamage = finalDamage * 1.2;
            attacker.takeDamage(counterDamage, battleLog, this); // 반격 피해
            battleLog(`↩️ ${this.name}이(가) [반격]으로 ${attacker.name}에게 ${counterDamage.toFixed(0)}의 피해를 되돌려주었습니다!`);
        }

        // [역습] 처리 (자신이 공격받았을 때)
        if (attacker && this.hasBuff('reversal_active')) {
            const storedDamage = this.aggroDamageStored || 0; // [도발]로 저장된 피해
            let reversalDamage = 0;
            let reversalDamageType = '';

            if (currentTurn % 2 !== 0) { // 홀수 턴
                reversalDamage = (this.atk + storedDamage) * 1.5;
                reversalDamageType = 'physical';
            } else { // 짝수 턴
                reversalDamage = (this.matk + storedDamage) * 1.5;
                reversalDamageType = 'magical';
            }
            attacker.takeDamage(reversalDamage, battleLog, this);
            battleLog(`⚡ ${this.name}이(가) [역습]으로 ${attacker.name}에게 ${reversalDamage.toFixed(0)}의 ${reversalDamageType} 피해를 주었습니다!`);
            this.aggroDamageStored = 0; // 반격 후 저장량 초기화
            this.removeBuffById('reversal_active'); // 역습 버프 제거
        }

        // [허무]의 피해 반사 처리
        const reflectBuff = this.buffs.find(b => b.id === 'damage_reflect'); // 허무에서 부여되는 버프 ID
        if (reflectBuff && reflectBuff.turnsLeft > 0 && attacker) {
            const reflectedDamage = finalDamage * reflectBuff.effect.value;
            attacker.takeDamage(reflectedDamage, battleLog, this);
            battleLog(`🛡️ ${this.name}이(가) [허무] 버프 효과로 ${attacker.name}에게 ${reflectedDamage.toFixed(0)}의 피해를 반사했습니다!`);
        }

        // [쇠약] 디버프 적용 (자신이 공격자일 경우)
        const weaknessDebuff = this.debuffs.find(d => d.id === 'weakness');
        if (weaknessDebuff && weaknessDebuff.turnsLeft > 0) {
            finalDamage *= (1 - weaknessDebuff.effect.damageReduction); // 20% 감소
        }

        logToBattleLog(`[${this.name}의 HP]: ${initialHp.toFixed(0)} -> ${this.currentHp.toFixed(0)}`);

        if (this.currentHp <= 0 && this.isAlive) { // 방금 죽었다면
            this.currentHp = 0;
            this.isAlive = false;
            battleLog(`💀 ${this.name}이(가) 쓰러졌습니다!`);
        }
    }
}

// --- 4. 핵심 전투 로직 함수 ---

// 영감 상성/역상성 스탯 계산 (복잡하니 간단하게만 구현)
// 이 함수는 공격 시에만 스탯이 변하는 것이 아니라,
// 특정 영감의 캐릭터를 대상으로 공격할 때 공격자의 스탯이 변하는 식으로 동작합니다.
function getAdjustedStat(baseStat, attackerType, defenderType, statType) {
    let adjustedStat = baseStat;

    // 야수 ➡️ 나무 ➡️ 천체 ➡️ 암석 ➡️ 야수 (화살표 방향이 상성, 역방향이 역상성)
    const weaknessMap = {
        "야수": "나무",
        "나무": "천체",
        "천체": "암석",
        "암석": "야수"
    };

    // 내가 상성 영감 상대로 공격/방어 시 내 스탯 감소 (역상성)
    if (weaknessMap[attackerType] === defenderType) { // 공격자 영감이 방어자 영감에게 역상성
        if (statType === 'physical') { // 야수 -> 나무 (공격력 감소)
            if (attackerType === '암석') adjustedStat = 10;
        } else { // 마법 공격 (마법 공격력 감소)
            if (attackerType === '나무') adjustedStat = 10;
        }
        // 실제로 이 로직은 복잡해질 수 있으니, 우선 단순화합니다.
        // 현재는 calculateDamage에서 attacker.atk/matk를 그대로 사용하고 있습니다.
        // 이 부분은 추후 '영감별 스탯 조정' 단계에서 더 정교하게 구현할 수 있습니다.
    }
    return adjustedStat;
}

// 피해 계산 함수 (이전 설명과 동일. 여기에 영감 상성 로직 추가 예정)
function calculateDamage(attacker, defender, skillPower, damageType) {
    let damage = 0;
    let attackStat = 0;
    let defenseStat = 0;

    // 공격력 계산 시 [쇠약] 디버프 효과 적용
    if (attacker.hasDebuff('weakness')) {
        const weaknessDebuff = attacker.debuffs.find(d => d.id === 'weakness');
        if (weaknessDebuff) {
            skillPower *= (1 - weaknessDebuff.effect.damageReduction); // 20% 감소
            // logToBattleLog(`(쇠약으로 ${attacker.name}의 피해량 ${weaknessDebuff.effect.damageReduction * 100}% 감소)`);
        }
    }

    if (damageType === 'physical') {
        attackStat = attacker.atk;
        defenseStat = defender.def;
        // 영감 상성/역상성 반영
        // 공격자 영감의 역상성 스탯은 10으로 고정 (예: 암석 -> 야수 공격 시 공격력 10)
        if (attacker.type === "암석" && defender.type === "야수") {
            attackStat = 10;
        }
        // 방어자 영감의 역상성 스탯은 10으로 고정 (예: 천체 -> 암석 공격 시 방어력 10)
        if (attacker.type === "천체" && defender.type === "암석") {
            defenseStat = 10;
        }

        damage = (attackStat * skillPower) - defenseStat;
    } else if (damageType === 'magical') {
        attackStat = attacker.matk;
        defenseStat = defender.mdef;
        // 영감 상성/역상성 반영
        // 공격자 영감의 역상성 스탯은 10으로 고정 (예: 나무 -> 천체 공격 시 마법 공격력 10)
        if (attacker.type === "나무" && defender.type === "천체") {
            attackStat = 10;
        }
        // 방어자 영감의 역상성 스탯은 10으로 고정 (예: 야수 -> 나무 공격 시 마법 방어력 10)
        if (attacker.type === "야수" && defender.type === "나무") {
            defenseStat = 10;
        }

        damage = (attackStat * skillPower) - defenseStat;
    } else if (damageType === 'fixed') {
        damage = skillPower;
    }

    if (damage < 1) {
        damage = 1; // 최소 피해는 1
    }

    return damage;
}


// 턴 시작 시 버프/디버프 갱신 등 처리 함수
function applyTurnEffects(character) {
    // 현재 턴에 받은 피해, 아군 피해 초기화 (근성, 역습용)
    character.currentTurnDamageTaken = 0;
    
    // 버프/디버프 턴 감소 및 효과 적용/제거
    character.buffs = character.buffs.filter(buff => {
        // [허무] 버프 - 턴 시작 시 HP 회복
        if (buff.effect.type === 'turn_start_heal' && buff.turnsLeft > 0) {
            const healAmount = buff.effect.value;
            character.currentHp = Math.min(character.maxHp, character.currentHp + healAmount);
            logToBattleLog(`💖 ${character.name}이(가) [${buff.name}] 효과로 ${healAmount.toFixed(0)}의 체력을 회복했습니다. (${character.currentHp.toFixed(0)} HP)`);
        }
        buff.turnsLeft--;
        return buff.turnsLeft > 0 || buff.unremovable; // 턴이 남았거나 해제 불가능하면 유지
    });

    character.debuffs = character.debuffs.filter(debuff => {
        // [중독] 피해 적용 (턴 종료 시 발동이지만, 지금은 턴 시작 시로 간주)
        if (debuff.id === 'poison' && debuff.turnsLeft > 0) {
            const poisonDamage = debuff.effect.damagePerTurn;
            character.takeDamage(poisonDamage, logToBattleLog); // 고정 피해
            logToBattleLog(`☠️ ${character.name}이(가) [${debuff.name}]으로 ${poisonDamage.toFixed(0)}의 피해를 입었습니다.`);
        }
        debuff.turnsLeft--;
        return debuff.turnsLeft > 0;
    });

    // [실재] 스택 적용 (공격력 증가)
    const realityBuff = character.buffs.find(b => b.id === 'reality_stacks');
    if (realityBuff && realityBuff.turnsLeft > 0) {
        // 실재 스택에 따른 공격력 증가 (나중에 캐릭터 스탯에 반영할 때 계산)
        // 여기서는 그냥 버프가 있다는 것만 알려주고, 실제 스탯 계산은 calculateDamage에서 추가적으로 고려할 수 있습니다.
        // 현재는 스탯에 직접 반영하지 않고, calculateDamage에서 필요시 버프 스탯을 가져와 적용하는 방식이 유연합니다.
    }
}

// 하나의 캐릭터가 행동을 수행
async function performCharacterAction(action) {
    const caster = action.caster;
    const skill = action.skill;
    const mainTarget = action.mainTarget;
    const subTarget = action.subTarget;

    if (!caster || !caster.isAlive) {
        return;
    }
    
    // 스킬 실행 전 버프/디버프 갱신 및 턴 시작 효과 적용
    applyTurnEffects(caster);

    logToBattleLog(`--- ${caster.name}의 턴 (${currentTurn} 턴) ---`);
    logToBattleLog(`${caster.name}이(가) [${skill.name}]을 사용합니다!`);

    let skillSuccess = true;
    if (skill.execute) {
        // [실존]처럼 스킬 사용 조건에 따라 실패할 수 있는 스킬을 위해 반환값 확인
        if (skill.id === SKILLS.SKILL_REALITY.id) {
            skillSuccess = skill.execute(caster, allyCharacters.filter(a => a.isAlive), enemyCharacters.filter(e => e.isAlive), logToBattleLog);
        } else if (skill.targetType === 'single_enemy' || skill.targetType === 'single_ally_or_self' || skill.targetType === 'single_ally') {
            skill.execute(caster, mainTarget, allyCharacters.filter(a => a.isAlive), enemyCharacters.filter(e => e.isAlive), logToBattleLog);
        } else if (skill.targetType === 'multi_enemy') { // 파열 스킬처럼
            skill.execute(caster, mainTarget, subTarget, allyCharacters.filter(a => a.isAlive), enemyCharacters.filter(e => e.isAlive), logToBattleLog);
        } else if (skill.targetType === 'self') {
            skill.execute(caster, allyCharacters.filter(a => a.isAlive), enemyCharacters.filter(e => e.isAlive), logToBattleLog);
        } else if (skill.targetType === 'all_allies' || skill.targetType === 'all_enemies') {
            skill.execute(caster, allyCharacters.filter(a => a.isAlive), enemyCharacters.filter(e => e.isAlive), logToBattleLog);
        }
    }

    if (!skillSuccess) {
        logToBattleLog(`스킬 사용에 실패했습니다.`);
        return; // 스킬 사용 실패 시 행동 종료
    }
    
    // 턴 종료 처리 (추가 공격, 중독 결산 후 랜덤 적군 공격 등)
    processEndOfTurnEffects(caster);
    displayCharacters(); // HP 등 변경사항 화면에 반영

    // 전투 종료 조건 확인
    checkBattleEnd();
}

// 턴 종료 시 발생하는 효과 처리 함수
function processEndOfTurnEffects(actingChar) {
    // [허상]의 턴 종료 추가 공격
    const illusionAttackBuff = actingChar.buffs.find(b => b.id === 'illusion_end_turn_attack');
    if (illusionAttackBuff && illusionAttackBuff.turnsLeft > 0) {
        const caster = findCharacterById(illusionAttackBuff.effect.attacker);
        const target = findCharacterById(illusionAttackBuff.effect.target);
        if (caster && target && target.isAlive) {
            const bonusDamage = calculateDamage(caster, target, 0.5, 'physical'); // 공격력 x0.5 물리 피해
            target.takeDamage(bonusDamage, logToBattleLog, caster);
            logToBattleLog(`☄️ [허상] 효과로 ${caster.name}이(가) ${target.name}에게 ${bonusDamage.toFixed(0)}의 추가 물리 피해를 주었습니다!`);
        }
        actingChar.removeBuffById('illusion_end_turn_attack'); // 1회성 발동 후 제거
    }

    // [진리]의 중독 결산 후 랜덤 적군 추가 공격
    const truthCasterBuff = actingChar.buffs.find(b => b.id === 'truth_caster_marker'); // 진리 사용자를 추적하는 가상의 버프
    if (truthCasterBuff && truthCasterBuff.turnsLeft > 0) {
        const aliveEnemies = enemyCharacters.filter(e => e.isAlive);
        if (aliveEnemies.length > 0) {
            const randomTarget = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            const bonusDamage = calculateDamage(actingChar, randomTarget, 0.3, 'physical'); // 사용자의 공격력 x0.3
            randomTarget.takeDamage(bonusDamage, logToBattleLog, actingChar);
            logToBattleLog(`🎯 [진리] 중독 결산 후 ${actingChar.name}이(가) ${randomTarget.name}에게 ${bonusDamage.toFixed(0)}의 추가 피해를 주었습니다!`);
        }
    }
}

// --- 전투 흐름 제어 함수 ---

function startBattle() {
    if (allyCharacters.length === 0 || enemyCharacters.length === 0) {
        alert('아군과 적군 모두 최소 한 명 이상의 캐릭터가 필요합니다!');
        return;
    }
    if (isBattleStarted) {
        alert('이미 전투가 시작되었습니다.');
        return;
    }

    isBattleStarted = true;
    currentTurn = 0;
    playerActionsQueue = []; // 큐 초기화
    currentActingCharacterIndex = 0; // 첫 아군부터 시작
    logToBattleLog('--- 전투 시작 ---');
    // 모든 캐릭터 HP 초기화 및 생존 상태로 설정
    [...allyCharacters, ...enemyCharacters].forEach(char => {
        char.currentHp = char.maxHp;
        char.isAlive = true;
        char.buffs = []; // 버프/디버프 초기화
        char.debuffs = [];
        char.shield = 0;
        char.aggroDamageStored = 0;
        char.lastSkillTurn = {};
        char.lastAttackedBy = null;
        char.currentTurnDamageTaken = 0;
        char.currentTurnAlliesDamageTaken = 0;
    });
    displayCharacters();

    startButton.style.display = 'none'; // 시작 버튼 숨기기
    nextTurnButton.style.display = 'block'; // 다음 턴 버튼 보이기
    executeTurnButton.style.display = 'none'; // 턴 실행 버튼 숨기기 (스킬 선택 후 보임)

    prepareNextTurn(); // 첫 턴 스킬 선택 시작
}

// 다음 턴 스킬 선택 준비
function prepareNextTurn() {
    if (!isBattleStarted) {
        alert('전투를 시작해주세요!');
        return;
    }
    if (autoBattleMode) return; // 자동 전투 중에는 수동 선택 안함

    // 이전 턴에 입력된 스킬이 모두 처리되었는지 확인
    if (playerActionsQueue.length > 0) {
        alert("이전 턴의 스킬 선택이 완료되지 않았습니다. '턴 실행' 버튼을 눌러주세요.");
        return;
    }

    currentTurn++;
    logToBattleLog(`\n=== ${currentTurn} 턴 스킬 선택 시작 ===`);
    playerActionsQueue = []; // 새 턴 시작 시 큐 초기화
    currentActingCharacterIndex = 0; // 항상 첫 번째 살아있는 아군부터 스킬 선택 시작

    showSkillSelectionForNextAlly();
}

// 다음 아군 캐릭터의 스킬 선택 UI 표시
function showSkillSelectionForNextAlly() {
    const aliveAllies = allyCharacters.filter(char => char.isAlive);
    if (currentActingCharacterIndex >= aliveAllies.length) {
        // 모든 아군 캐릭터의 스킬 선택이 완료됨
        logToBattleLog('모든 아군 캐릭터의 스킬 선택이 완료되었습니다.');
        skillSelectionArea.style.display = 'none'; // 스킬 선택 UI 숨기기
        executeTurnButton.style.display = 'block'; // 턴 실행 버튼 보이기
        nextTurnButton.style.display = 'none'; // 다음 턴 버튼 숨기기
        return;
    }

    const actingChar = aliveAllies[currentActingCharacterIndex];
    currentActingCharName.textContent = actingChar.name;

    // 사용 가능한 스킬 버튼 생성
    availableSkillsDiv.innerHTML = '';
    actingChar.skills.forEach(skillId => {
        const skill = SKILLS[skillId];
        if (skill) {
            const button = document.createElement('button');
            button.textContent = skill.name;
            button.onclick = () => selectSkill(skill.id);
            availableSkillsDiv.appendChild(button);
        }
    });

    selectedSkillId = null; // 선택된 스킬 초기화
    selectedTargetCharId = null; // 선택된 대상 초기화
    selectedSubTargetCharId = null;
    selectedTargetName.textContent = '없음';
    confirmSkillButton.style.display = 'none'; // 확정 버튼 숨김
    skillSelectionArea.style.display = 'block'; // 스킬 선택 UI 표시
    displayCharacters(); // 대상 선택을 위해 캐릭터 목록 갱신
}

// 스킬 선택
function selectSkill(skillId) {
    selectedSkillId = skillId;
    // 대상 선택 초기화 (새 스킬 선택 시)
    selectedTargetCharId = null;
    selectedSubTargetCharId = null;
    selectedTargetName.textContent = '없음';
    confirmSkillButton.style.display = 'none'; // 스킬만 선택했을 때는 확정 버튼 숨김

    const skill = SKILLS[skillId];
    logToBattleLog(`${currentActingCharName.textContent}이(가) [${skill.name}] 스킬을 선택했습니다. 대상을 선택해주세요.`);

    // 대상 선택 필요 여부에 따라 확정 버튼 활성화
    if (skill.targetSelection === 'self' || skill.targetType === 'all_allies' || skill.targetType === 'all_enemies') {
        // 자신 대상 또는 전체 대상 스킬은 즉시 확정 가능
        confirmSkillButton.style.display = 'block';
        selectedTargetCharId = currentActingChar.id; // 자신으로 자동 지정
        selectedTargetName.textContent = currentActingChar.name;
    } else {
        // 단일/광역 대상 스킬은 클릭하여 대상 선택 필요
        // 이때는 confirmSkillButton이 바로 보이면 안됩니다.
    }
    displayCharacters(); // 선택 상태 표시
}

// 대상 선택 (캐릭터 카드 클릭 시)
function selectTarget(targetCharId) {
    if (!selectedSkillId) {
        alert('먼저 사용할 스킬을 선택해 주세요!');
        return;
    }

    const actingChar = allyCharacters.filter(char => char.isAlive)[currentActingCharacterIndex];
    const skill = SKILLS[selectedSkillId];
    const targetChar = findCharacterById(targetCharId);

    if (!targetChar || !targetChar.isAlive) {
        alert('유효한 대상을 선택해 주세요!');
        return;
    }

    // 스킬의 대상 유형에 따라 대상 지정
    if (skill.targetSelection === 'self') {
        selectedTargetCharId = actingChar.id;
        selectedTargetName.textContent = actingChar.name;
    } else if (skill.targetSelection === 'ally' || skill.targetSelection === 'ally_or_self') {
        if (!allyCharacters.includes(targetChar)) {
            alert('아군 스킬은 아군에게만 사용할 수 있습니다!');
            return;
        }
        selectedTargetCharId = targetCharId;
        selectedTargetName.textContent = targetChar.name;
    } else if (skill.targetSelection === 'enemy') {
        if (!enemyCharacters.includes(targetChar)) {
            alert('공격/디버프 스킬은 적군에게만 사용할 수 있습니다!');
            return;
        }
        selectedTargetCharId = targetCharId;
        selectedTargetName.textContent = targetChar.name;
    } else if (skill.targetSelection === 'two_enemies') {
        // 파열 스킬처럼 두 명의 적을 선택할 경우
        if (!selectedTargetCharId) { // 첫 번째 대상 선택
            selectedTargetCharId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            logToBattleLog(`[파열]의 첫 번째 대상: ${targetChar.name}. 두 번째 대상을 선택해주세요.`);
        } else if (selectedTargetCharId === targetCharId) {
            alert('첫 번째 대상과 다른 대상을 선택해주세요.');
            return;
        } else { // 두 번째 대상 선택
            selectedSubTargetCharId = targetCharId;
            selectedTargetName.textContent += `, ${targetChar.name}`;
            logToBattleLog(`[파열]의 두 번째 대상: ${targetChar.name}.`);
        }
    } else { // 대상 지정이 필요 없는 스킬
        selectedTargetCharId = null;
        selectedTargetName.textContent = '없음';
    }

    // 모든 대상이 선택되었는지 확인 후 확정 버튼 활성화
    if (selectedSkillId) {
        const skill = SKILLS[selectedSkillId];
        let allTargetsSelected = false;
        if (skill.targetSelection === 'self' || skill.targetType === 'all_allies' || skill.targetType === 'all_enemies') {
            allTargetsSelected = true;
        } else if (skill.targetSelection === 'two_enemies') {
            allTargetsSelected = selectedTargetCharId && selectedSubTargetCharId;
        } else {
            allTargetsSelected = selectedTargetCharId !== null;
        }

        if (allTargetsSelected) {
            confirmSkillButton.style.display = 'block';
        }
    }
    displayCharacters(); // 선택 상태 표시
}

// 스킬 선택 확정 및 큐에 추가
function confirmSkillSelection() {
    const actingChar = allyCharacters.filter(char => char.isAlive)[currentActingCharacterIndex];
    const skill = SKILLS[selectedSkillId];
    let mainTarget = null;
    let subTarget = null;

    if (!actingChar || !skill) {
        alert('캐릭터나 스킬이 선택되지 않았습니다.');
        return;
    }

    // 스킬 유형에 따른 대상 확인
    if (skill.targetSelection === 'self') {
        mainTarget = actingChar;
    } else if (skill.targetSelection === 'ally' || skill.targetSelection === 'ally_or_self') {
        mainTarget = findCharacterById(selectedTargetCharId);
        if (!mainTarget || !allyCharacters.includes(mainTarget)) {
            alert('올바른 아군 대상을 선택해 주세요.');
            return;
        }
    } else if (skill.targetSelection === 'enemy') {
        mainTarget = findCharacterById(selectedTargetCharId);
        if (!mainTarget || !enemyCharacters.includes(mainTarget)) {
            alert('올바른 적군 대상을 선택해 주세요.');
            return;
        }
    } else if (skill.targetSelection === 'two_enemies') {
        mainTarget = findCharacterById(selectedTargetCharId);
        subTarget = findCharacterById(selectedSubTargetCharId);
        if (!mainTarget || !subTarget || !enemyCharacters.includes(mainTarget) || !enemyCharacters.includes(subTarget)) {
            alert('두 명의 적군 대상을 모두 선택해 주세요.');
            return;
        }
    }
    // 광역 스킬 (all_allies, all_enemies)은 대상 선택 UI가 필요 없으므로 mainTarget을 null로 둠

    playerActionsQueue.push({
        caster: actingChar,
        skill: skill,
        mainTarget: mainTarget,
        subTarget: subTarget // 파열 스킬 같은 경우 사용
    });
    logToBattleLog(`✅ ${actingChar.name}의 행동: [${skill.name}] (${selectedTargetName.textContent}) 이(가) 대기열에 추가되었습니다.`);

    // 다음 아군 캐릭터 스킬 선택으로 이동
    currentActingCharacterIndex++;
    showSkillSelectionForNextAlly();
}

// 턴 실행 (사용자가 선택한 스킬들을 순서대로 실행)
async function executeBattleTurn() {
    if (!isBattleStarted) {
        alert('전투를 시작해 주세요!');
        return;
    }
    if (playerActionsQueue.length === 0) {
        alert('먼저 아군 캐릭터들의 스킬을 선택해 주세요!');
        return;
    }

    logToBattleLog(`\n--- ${currentTurn} 턴 실행 시작 ---`);

    // 아군 턴 행동 (큐에 저장된 순서대로)
    for (const action of playerActionsQueue) {
        if (action.caster.isAlive) {
            await performCharacterAction(action);
            if (!isBattleStarted) return; // 전투 종료 시 중단
        }
    }

    // 적군 턴 행동 (자동)
    logToBattleLog(`\n--- ${currentTurn} 턴 적군 행동 시작 ---`);
    for (const enemyChar of enemyCharacters) {
        if (enemyChar.isAlive) {
            await performEnemyAction(enemyChar); // 적군 행동 로직
            if (!isBattleStarted) return; // 전투 종료 시 중단
        }
    }

    playerActionsQueue = []; // 현재 턴의 행동 큐 초기화
    
    // 턴 종료 후 상태 업데이트
    displayCharacters();
    // 다음 턴을 위한 UI 준비
    nextTurnButton.style.display = 'block'; // 다음 턴 스킬 선택 버튼 활성화
    executeTurnButton.style.display = 'none'; // 턴 실행 버튼 비활성화
    // 만약 자동 전투 모드라면 다음 턴 준비 자동 시작
    if (autoBattleMode) {
        setTimeout(prepareNextTurn, 1500); // 1.5초 후 다음 턴 준비
    }
}

// 적군 행동 로직 (간단하게 구현)
async function performEnemyAction(enemyChar) {
    if (!enemyChar.isAlive) return;

    // [도발]에 걸린 아군이 있는지 확인
    let provokedAlly = allyCharacters.find(a => a.isAlive && a.hasDebuff('provoked') && a.debuffs.find(d => d.id === 'provoked' && d.effect.target === a.id));
    
    let target = null;
    if (provokedAlly) {
        target = provokedAlly; // 도발된 아군 우선 공격
        logToBattleLog(`${enemyChar.name}이(가) ${target.name}에게 도발되어 공격합니다.`);
    } else {
        // HP가 가장 낮은 아군 타겟팅
        const aliveAllies = allyCharacters.filter(a => a.isAlive);
        if (aliveAllies.length > 0) {
            target = aliveAllies.reduce((min, char) => (char.currentHp < min.currentHp ? char : min), aliveAllies[0]);
            logToBattleLog(`${enemyChar.name}이(가) HP가 가장 낮은 ${target.name}을(를) 공격합니다.`);
        }
    }

    if (target) {
        applyTurnEffects(enemyChar); // 적군 턴 시작 효과 적용
        // 임시로 적군도 '서막' 스킬을 사용한다고 가정
        const skill = SKILLS.SKILL_OVERTURE;
        const damageType = enemyChar.atk > enemyChar.matk ? 'physical' : 'magical';
        const skillPower = damageType === 'physical' ? 2.0 : 2.5;
        const damage = calculateDamage(enemyChar, target, skillPower, damageType);
        target.takeDamage(damage, logToBattleLog, enemyChar);
        logToBattleLog(`⚔️ ${enemyChar.name}이(가) [${skill.name}]으로 ${target.name}에게 ${damage.toFixed(0)}의 ${damageType === 'physical' ? '물리' : '마법'} 피해를 주었습니다!`);
    } else {
        logToBattleLog(`${enemyChar.name}이(가) 공격할 대상이 없습니다.`);
    }
    processEndOfTurnEffects(enemyChar); // 턴 종료 효과 처리 (적군)
    displayCharacters();
}


// 전투 종료 조건 확인
function checkBattleEnd() {
    const allEnemiesDead = enemyCharacters.every(char => !char.isAlive);
    const allAlliesDead = allyCharacters.every(char => !char.isAlive);

    if (allEnemiesDead) {
        logToBattleLog('--- 모든 적을 물리쳤습니다! 전투 승리! 🎉 ---');
        isBattleStarted = false;
        autoBattleMode = false;
        startButton.style.display = 'block'; // 시작 버튼 다시 보이기
        nextTurnButton.style.display = 'none';
        executeTurnButton.style.display = 'none';
        skillSelectionArea.style.display = 'none';
        return true;
    } else if (allAlliesDead) {
        logToBattleLog('--- 모든 아군이 쓰러졌습니다! 전투 패배! 😭 ---');
        isBattleStarted = false;
        autoBattleMode = false;
        startButton.style.display = 'block'; // 시작 버튼 다시 보이기
        nextTurnButton.style.display = 'none';
        executeTurnButton.style.display = 'none';
        skillSelectionArea.style.display = 'none';
        return true;
    }
    return false;
}

// ID로 캐릭터 찾기 유틸리티 함수
function findCharacterById(id) {
    return [...allyCharacters, ...enemyCharacters].find(char => char.id === id);
}

// 자동 전투 시작/정지 함수 (수정됨)
function autoBattle() {
    if (!isBattleStarted) {
        startBattle(); // 전투가 시작되지 않았다면 먼저 시작
    }
    autoBattleMode = !autoBattleMode; // 모드 토글
    if (autoBattleMode) {
        logToBattleLog('--- 자동 전투 시작 (아군은 스킬 자동 선택) ---');
        // 자동 전투 모드 시, 아군 스킬 선택도 자동으로 진행
        // 여기서는 임시로 첫 번째 스킬을 사용하도록 설정 (나중에 AI로직 추가)
        const aliveAllies = allyCharacters.filter(char => char.isAlive);
        if (aliveAllies.length > 0) {
            playerActionsQueue = []; // 기존 선택 초기화
            aliveAllies.forEach(char => {
                const availableSkill = char.skills.length > 0 ? SKILLS[char.skills[0]] : null; // 첫 번째 스킬 자동 선택
                if (availableSkill) {
                    let mainTarget = null;
                    let subTarget = null;

                    // 자동 전투 시 대상도 자동으로 선택 (예: 첫 번째 적, 자신 등)
                    if (availableSkill.targetSelection === 'self' || availableSkill.targetType === 'all_allies') {
                        mainTarget = char;
                    } else if (availableSkill.targetSelection === 'enemy' || availableSkill.targetSelection === 'two_enemies' || availableSkill.targetType === 'all_enemies') {
                        const availableEnemies = enemyCharacters.filter(e => e.isAlive);
                        if (availableEnemies.length > 0) {
                            mainTarget = availableEnemies[0];
                            if (availableSkill.targetSelection === 'two_enemies' && availableEnemies.length > 1) {
                                subTarget = availableEnemies[1];
                            }
                        }
                    } else if (availableSkill.targetSelection === 'ally' || availableSkill.targetSelection === 'ally_or_self') {
                        const availableAllies = allyCharacters.filter(a => a.isAlive);
                        if (availableAllies.length > 0) {
                            mainTarget = availableAllies[0];
                        }
                    }

                    if (mainTarget) {
                        playerActionsQueue.push({
                            caster: char,
                            skill: availableSkill,
                            mainTarget: mainTarget,
                            subTarget: subTarget
                        });
                        logToBattleLog(`(자동) ${char.name}: [${availableSkill.name}] -> ${mainTarget.name}${subTarget ? `, ${subTarget.name}` : ''}`);
                    } else {
                        logToBattleLog(`(자동) ${char.name}: [${availableSkill.name}]을 사용할 대상이 없습니다. (건너뜀)`);
                    }
                }
            });
        }
        executeBattleTurn(); // 자동 전투 시작 시 바로 턴 실행
    } else {
        logToBattleLog('--- 자동 전투 중지 ---');
    }
    // 자동 전투 모드에서는 수동 스킬 선택 UI 숨김
    skillSelectionArea.style.display = autoBattleMode ? 'none' : 'block';
    nextTurnButton.style.display = autoBattleMode ? 'none' : 'block';
    executeTurnButton.style.display = autoBattleMode ? 'none' : 'none'; // 자동 전투 중에는 실행 버튼도 숨김
}


// 페이지 로드 시 초기 설정
document.addEventListener('DOMContentLoaded', () => {
    // 초기 아군 캐릭터 추가 (테스트용)
    allyCharacters.push(new Character("파투투", "야수"));
    allyCharacters.push(new Character("튜즈데이", "천체"));
    allyCharacters.push(new Character("이졸데", "나무"));
    
    // 초기 적군 캐릭터 추가 (테스트용)
    enemyCharacters.push(new Character("우어어", "야수"));
    enemyCharacters.push(new Character("우아아", "암석"));
    
    displayCharacters(); // 초기 캐릭터 표시
});
