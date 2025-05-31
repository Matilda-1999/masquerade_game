// --- 0. 상수 정의 ---
const MAP_WIDTH = 5;
const MAP_HEIGHT = 5;

const SKILLS = { // 이전 답변에서 이미 로그 스타일 수정된 내용 반영된 것으로 가정
    // [근성]
    SKILL_RESILIENCE: {
        id: "SKILL_RESILIENCE",
        name: "근성",
        type: "어그로",
        description: "자신에게 현재 체력의 2.5배 보호막 부여. 해당 턴에 발생한 모든 아군의 감소한 체력을 대신 감소.",
        targetType: "self",
        targetSelection: "self",
        execute: (caster, allies, enemies, battleLog) => { // self 타입이지만, executeSingleAction에서 allies, enemies도 전달받을 수 있음
            const shieldAmount = caster.currentHp * 2.5;
            caster.shield += shieldAmount;
            battleLog(`✦보호막✦ ${caster.name}, [근성] 사용: 자신에게 ${shieldAmount.toFixed(0)} 보호막 획득. (현재 보호막: ${caster.shield.toFixed(0)})`);
            caster.aggroDamageStored = 0;
            return true;
        }
    },
    // [반격]
    SKILL_COUNTER: {
        id: "SKILL_COUNTER",
        name: "반격",
        type: "카운터",
        description: "자신이 지닌 보호막을 모든 아군에게 균등하게 나눔. 해당 턴에 자신이 공격받은 후, 모든 적군에게 (받는 피해)x1.2 피해. 아군이 공격받은 후, 모든 적군에게 (받는 피해)x0.5 피해.",
        targetType: "all_allies",
        targetSelection: "all_allies",
        execute: (caster, allies, enemies, battleLog) => {
            const skillName = SKILLS.SKILL_COUNTER.name; // 스킬 이름 변수화
            if (caster.shield > 0) {
                const liveAllies = allies.filter(a => a.isAlive && a.id !== caster.id); // 시전자를 제외한 살아있는 아군
                const targetAlliesForLog = liveAllies.length > 0 ? liveAllies : (allies.filter(a => a.isAlive).length === 1 && allies[0].id === caster.id ? [] : allies.filter(a => a.isAlive)); // 로그용 대상 선정 (자신만 있을 경우 빈 배열)
        
        
                if (targetAlliesForLog.length > 0) { // 시전자 포함 살아있는 아군이 1명 초과일 때 (즉, 다른 아군이 있을 때)
                    const allLivingAlliesIncludingCaster = allies.filter(a => a.isAlive); // 보호막 분배 대상은 시전자 포함
                    const shieldPerAlly = caster.shield / allLivingAlliesIncludingCaster.length;
                    
                    battleLog(`✦스킬✦ ${caster.name}, [${skillName}] 사용: 자신의 보호막(${caster.shield.toFixed(0)})을 모든 살아 있는 아군 ${allLivingAlliesIncludingCaster.length}명에게 분배.`);
        
                    allLivingAlliesIncludingCaster.forEach(ally => {
                        ally.shield += shieldPerAlly;
                        battleLog(`  ✦보호막✦ ${ally.name}: 보호막 +${shieldPerAlly.toFixed(0)}. (현재 ${ally.shield.toFixed(0)})`);
                    });
                    caster.shield = 0;
                } else {
                    // 시전자 자신만 살아 있거나, 다른 아군이 없는 경우
                    battleLog(`✦정보✦ ${caster.name}, [${skillName}]: 보호막을 나눌 다른 아군이 없습니다. (보호막: ${caster.shield.toFixed(0)})`);
                }
            } else {
                battleLog(`✦정보✦ ${caster.name}, [${skillName}]: 나눌 보호막이 없습니다.`);
            }
            return true;
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
                enemy.addDebuff('provoked', '도발 (타겟 고정)', 2, { targetId: caster.id });
            });
            caster.aggroDamageStored = 0;
            battleLog(`✦효과✦ ${caster.name}, [도발] 사용: 모든 적을 도발하며, 자신은 받는 피해가 감소합니다.`);
            return true;
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
        execute: (caster, allies, enemies, battleLog) => { // battleLog 파라미터 추가 (일관성 및 사용)
            const hpLoss = caster.currentHp * 0.5;
            caster.currentHp -= hpLoss;
            if (caster.currentHp < 1) caster.currentHp = 1;
            battleLog(`✦소모✦ ${caster.name}, [역습] 사용 준비: 체력 ${hpLoss.toFixed(0)} 소모. (현재 HP: ${caster.currentHp.toFixed(0)})`);
            caster.addBuff('reversal_active', '역습 대기', 1, {});
            return true;
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
            if (!target) {
                battleLog(`✦정보✦ ${caster.name} [허상]: 스킬 대상을 찾을 수 없습니다.`);
                return false;
            }
            if (caster.id === target.id) {
                const healAmount = caster.atk * 0.5;
                caster.currentHp = Math.min(caster.maxHp, caster.currentHp + healAmount);
                battleLog(`✦회복✦ ${caster.name}, [허상] 사용 (자신): 체력 ${healAmount.toFixed(0)} 회복. (HP: ${caster.currentHp.toFixed(0)})`);
            } else {
                const hpLoss = caster.atk * 0.2;
                caster.currentHp -= hpLoss;
                if (caster.currentHp < 1) caster.currentHp = 1;
                battleLog(`✦소모✦ ${caster.name}, [허상] 사용 (${target.name} 대상): 체력 ${hpLoss.toFixed(0)} 소모. (HP: ${caster.currentHp.toFixed(0)})`);
                target.addBuff('illusion_atk_boost', '공격력 증가 (허상)', 2, { multiplier: 2.0 });
                battleLog(`✦버프✦ ${target.name}: [허상 효과] 공격력 2배 증가 (2턴).`);
            }
            const firstAliveEnemy = enemies.find(e => e.isAlive);
            if (firstAliveEnemy) {
                 caster.addBuff('illusion_end_turn_attack', '턴 종료 추가 공격 (허상)', 1, { attackerId: caster.id, originalTargetId: target.id, enemyTargetId: firstAliveEnemy.id });
            } else {
                battleLog(`✦정보✦ ${caster.name} [허상]: 턴 종료 추가 공격 대상을 찾을 수 없습니다.`);
            }
            return true;
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
                battleLog(`✦정보✦ ${caster.name} [허무]: 스킬 대상을 찾을 수 없습니다.`);
                return false;
            }
            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [허무] 사용: 디버프 정화 및 랜덤 버프 부여.`);
            const removableDebuffs = target.debuffs.filter(d => ['상태 이상', '제어', '속성 감소'].includes(d.effect.category || '기타'));
            if (removableDebuffs.length > 0) {
                for (let i = 0; i < Math.min(2, removableDebuffs.length); i++) {
                    const debuffIndex = Math.floor(Math.random() * removableDebuffs.length);
                    const debuffToRemove = removableDebuffs[debuffIndex];
                    target.removeDebuffById(debuffToRemove.id);
                    battleLog(`✦정화✦ ${target.name}: [${debuffToRemove.name}] 디버프 정화됨.`);
                    removableDebuffs.splice(debuffIndex, 1);
                }
            } else {
                battleLog(`✦정보✦ ${target.name}: 정화할 수 있는 디버프가 없습니다.`);
            }

            const buffChoices = [
                { id: 'nihility_heal', name: '턴 시작 시 HP 회복 (허무)', turns: 2, effect: { type: 'turn_start_heal', value: caster.atk * 0.5 } },
                { id: 'nihility_reflect', name: '피해 반사 (허무)', turns: 2, effect: { type: 'damage_reflect', value: 0.3 } },
                { id: 'nihility_def', name: '방어력 증가 (허무)', turns: 2, effect: { type: 'def_boost_multiplier', value: 0.3 } },
                { id: 'nihility_atk', name: '공격력 증가 (허무)', turns: 2, effect: { type: 'atk_boost_multiplier', value: 1.5 } }
            ];
            const chosenBuff = buffChoices[Math.floor(Math.random() * buffChoices.length)];
            target.addBuff(chosenBuff.id, chosenBuff.name, chosenBuff.turns, chosenBuff.effect);
            battleLog(`✦버프✦ ${target.name}: [허무 효과] [${chosenBuff.name}] 획득 (2턴).`);
            return true;
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
                 battleLog(`✦정보✦ ${caster.name}, [실존] 사용 불가: 쿨타임 ${3 - (currentTurnNum - lastUsedTurn)}턴 남음.`);
                 return false;
            }
            battleLog(`✦스킬✦ ${caster.name}, [실존] 사용: 모든 아군 방어력 증가 및 자신에게 [실재] 스택 부여.`);
            allies.filter(a => a.isAlive).forEach(ally => {
                ally.addBuff('reality_def_boost', '방어력 증가 (실존)', 2, { defBoostMultiplier: 0.3 });
            });
            battleLog(`✦버프✦ 모든 아군: 방어력 30% 증가 (2턴).`);

            let realityStacks = 4;
            battleLog(`✦버프✦ ${caster.name}: [실재] ${realityStacks}스택 추가 획득 (2턴, 해제 불가).`);
            caster.addBuff('reality_stacks', '실재', 2, { atkBoostPerStack: 0.4, stacks: realityStacks, unremovable: true });
            caster.lastSkillTurn[SKILLS.SKILL_REALITY.id] = currentTurnNum;
            return true;
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
            battleLog(`✦스킬✦ ${caster.name}, [진리] 사용: 모든 적에게 [중독]을 부여합니다.`);
            enemies.filter(e => e.isAlive).forEach(enemy => {
                enemy.addDebuff('poison', '중독', 2, { damagePerTurn: caster.atk * 0.5, type: 'fixed', casterId: caster.id });
                battleLog(`✦상태 이상✦ ${enemy.name}, [중독] 효과 적용 (2턴).`);
            });
            caster.addBuff('truth_caster_marker', '진리 사용자 (추가 공격 대기)', 1, { originalCasterId: caster.id });
            return true;
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
            if (!target) { battleLog(`✦정보✦ ${caster.name} [서막]: 스킬 대상을 찾을 수 없습니다.`); return false; }
            const damageType = caster.atk >= caster.matk ? 'physical' : 'magical';
            const skillPower = damageType === 'physical' ? 2.0 : 2.5;
            const damage = calculateDamage(caster, target, skillPower, damageType);
            target.takeDamage(damage, battleLog, caster);
            battleLog(`✦피해✦ ${caster.name}, [서막]: ${target.name}에게 ${damage.toFixed(0)} ${damageType === 'physical' ? '물리' : '마법'} 피해.`);
            target.addDebuff('scratch', '흠집', 2, { maxStacks: 3, overrideDuration: true, removerSkillId: SKILLS.SKILL_CLIMAX.id });
            battleLog(`✦디버프✦ ${target.name}, [흠집] 효과 적용 (현재 ${target.getDebuffStacks('scratch')}스택).`);
            return true;
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
            if (!target) { battleLog(`✦정보✦ ${caster.name} [절정]: 스킬 대상을 찾을 수 없습니다.`); return false; }
            const damageType = caster.atk >= caster.matk ? 'physical' : 'magical';
            const skillPower = damageType === 'physical' ? 2.7 : 3.1;
            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [절정] 3연타 공격!`);
            for (let i = 0; i < 3; i++) {
                const damage = calculateDamage(caster, target, skillPower / 3, damageType);
                target.takeDamage(damage, battleLog, caster);
                battleLog(`  ✦피해✦ [절정] ${i + 1}타: ${target.name}에게 ${damage.toFixed(0)} ${damageType === 'physical' ? '물리' : '마법'} 피해.`);
                if (!target.isAlive) break;
            }
            if (!target.isAlive) return true;

            const scratchStacks = target.getDebuffStacks('scratch');
            if (scratchStacks > 0) {
                battleLog(`✦효과✦ ${target.name} [흠집 ${scratchStacks}스택]: 추가타 발생!`);
                let bonusSkillPowerPercent = 0;
                if (damageType === 'physical') {
                    if (scratchStacks === 1) bonusSkillPowerPercent = 0.25; else if (scratchStacks === 2) bonusSkillPowerPercent = 0.35; else if (scratchStacks >= 3) bonusSkillPowerPercent = 0.45;
                } else {
                    if (scratchStacks === 1) bonusSkillPowerPercent = 0.30; else if (scratchStacks === 2) bonusSkillPowerPercent = 0.40; else if (scratchStacks >= 3) bonusSkillPowerPercent = 0.50;
                }
                for (let i = 0; i < 2; i++) {
                    const bonusDamage = calculateDamage(caster, target, bonusSkillPowerPercent, damageType);
                    target.takeDamage(bonusDamage, battleLog, caster);
                    battleLog(`  ✦추가 피해✦ [흠집 효과] ${i + 1}회: ${target.name}에게 ${bonusDamage.toFixed(0)} 추가 ${damageType === 'physical' ? '물리' : '마법'} 피해.`);
                    if (!target.isAlive) break;
                }
                if (target.isAlive) target.removeDebuffById('scratch');
                battleLog(`✦정보✦ ${target.name}: [흠집] 효과 소멸.`);
            }
            if (!target.isAlive) return true;

            target.addDebuff('weakness', '쇠약', 2, { damageMultiplierReduction: 0.2 });
            battleLog(`✦상태 이상✦ ${target.name}, [쇠약] 효과 적용 (2턴).`);
            return true;
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
            if (!target) { battleLog(`✦정보✦ ${caster.name} [간파]: 스킬 대상을 찾을 수 없습니다.`); return false; }
            const damageType = caster.atk >= caster.matk ? 'physical' : 'magical';
            const skillPower1 = damageType === 'physical' ? 1.9 : 2.4;
            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [간파] 2연타 공격!`);
            for (let i=0; i<2; i++) {
                const damage1 = calculateDamage(caster, target, skillPower1 / 2, damageType);
                target.takeDamage(damage1, battleLog, caster);
                battleLog(`  ✦피해✦ [간파] ${i+1}타: ${target.name}에게 ${damage1.toFixed(0)} ${damageType === 'physical' ? '물리' : '마법'} 피해.`);
                if (!target.isAlive) return true;
            }

            const skillPower2 = damageType === 'physical' ? 0.5 : 0.7;
            const damage2 = calculateDamage(caster, target, skillPower2, damageType);
            target.takeDamage(damage2, battleLog, caster);
            battleLog(`✦추가 피해✦ ${caster.name} [간파 효과]: ${target.name}에게 ${damage2.toFixed(0)} 추가 ${damageType === 'physical' ? '물리' : '마법'} 피해.`);
            if (!target.isAlive) return true;
            
            target.addDebuff('weakness', '쇠약', 2, { damageMultiplierReduction: 0.2 });
            battleLog(`✦상태 이상✦ ${target.name}, [쇠약] 효과 적용 (2턴).`);
            return true;
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
            if (!mainTarget) { battleLog(`✦정보✦ ${caster.name} [파열]: 주 대상을 찾을 수 없습니다.`); return false; }
            const damageType = caster.atk >= caster.matk ? 'physical' : 'magical';
            battleLog(`✦스킬✦ ${caster.name}, [파열] 사용! 주 대상: ${mainTarget.name}${subTarget && subTarget.isAlive ? ', 부 대상: ' + subTarget.name : ''}.`);
            
            const mainSkillPower = damageType === 'physical' ? 2.1 : 2.6;
            const mainDamage = calculateDamage(caster, mainTarget, mainSkillPower, damageType);
            mainTarget.takeDamage(mainDamage, battleLog, caster);
            battleLog(`  ✦피해✦ [파열 주 대상] ${mainTarget.name}: ${mainDamage.toFixed(0)} ${damageType === 'physical' ? '물리' : '마법'} 피해.`);
            if (mainTarget.hasDebuff('weakness')) {
                const bonusFixedDamage = mainDamage * 0.3;
                mainTarget.takeDamage(bonusFixedDamage, battleLog, caster); 
                battleLog(`  ✦추가 피해✦ ${mainTarget.name} [쇠약 대상 효과]: ${bonusFixedDamage.toFixed(0)} 추가 고정 피해.`);
            }
            if (!mainTarget.isAlive && (!subTarget || !subTarget.isAlive)) return true;

            if (subTarget && subTarget.isAlive && mainTarget.id !== subTarget.id) {
                const subSkillPower = damageType === 'physical' ? 1.3 : 1.8;
                const subDamage = calculateDamage(caster, subTarget, subSkillPower, damageType);
                subTarget.takeDamage(subDamage, battleLog, caster);
                battleLog(`  ✦피해✦ [파열 부 대상] ${subTarget.name}: ${subDamage.toFixed(0)} ${damageType === 'physical' ? '물리' : '마법'} 피해.`);
                if (subTarget.hasDebuff('weakness')) {
                    const bonusFixedDamageSub = subDamage * 0.3;
                    subTarget.takeDamage(bonusFixedDamageSub, battleLog, caster);
                    battleLog(`  ✦추가 피해✦ ${subTarget.name} [쇠약 대상 효과]: ${bonusFixedDamageSub.toFixed(0)} 추가 고정 피해.`);
                }
            }
            return true;
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
const skillDescriptionArea = getElement('skillDescriptionArea'); // 스킬 설명


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
        const prevIsAlive = this.isAlive; // 사망 로그를 위해 이전 생존 상태 저장
    
        const provokeReductionBuff = this.buffs.find(b => b.id === 'provoke_damage_reduction' && b.turnsLeft > 0);
        if (provokeReductionBuff) {
            finalDamage *= (1 - provokeReductionBuff.effect.damageReduction);
            logFn(`✦효과✦ ${this.name} [도발]: 받는 피해 ${rawDamage.toFixed(0)} → ${finalDamage.toFixed(0)}(으)로 감소.`);
        }
    
        if (this.shield > 0) {
            const damageToShield = Math.min(finalDamage, this.shield);
            if (damageToShield > 0) { // 실제로 보호막으로 피해를 흡수했을 때만 로그
                this.shield -= damageToShield;
                finalDamage -= damageToShield;
                logFn(`✦보호막✦ ${this.name}: 보호막으로 피해 ${damageToShield.toFixed(0)} 흡수. (남은 보호막: ${this.shield.toFixed(0)})`);
            }
        }
    
        this.currentHp -= finalDamage;
        // 실제 체력 감소량 (보호막으로 흡수된 것을 제외하고, 음수 피해는 0으로 처리)
        const actualHpLoss = Math.max(0, initialHp - (this.shield > 0 ? initialHp - finalDamage + this.shield : this.currentHp) );
        // 위 계산이 복잡하면, 더 간단하게는 finalDamage (보호막으로 감소된 후의 순수 피해량)을 기준으로 변경
        // 여기서는 실제 체력이 변한 양을 기준으로 확인
        const netHpChange = initialHp - this.currentHp;
    
    
        this.currentTurnDamageTaken += Math.max(0, netHpChange); // 음수 회복은 피해로 기록하지 않음
        this.lastAttackedBy = attacker ? attacker.id : null;
    
        // 반격/역습/피해 반사 효과
        if (attacker && attacker.isAlive) {
            if (this.hasBuff('counter_active')) {
                const counterDamage = Math.max(0, netHpChange) * 1.2; // 실제 체력 감소분 기반
                if (counterDamage > 0) {
                    logFn(`✦반격✦ ${this.name}: ${attacker.name}에게 ${counterDamage.toFixed(0)} 피해 되돌려줌.`);
                    attacker.takeDamage(counterDamage, logFn, this);
                }
            }
            if (this.hasBuff('reversal_active')) {
                const storedDamage = this.aggroDamageStored || 0;
                let reversalDamage = 0;
                let reversalDamageType = '';
                if (currentTurn % 2 !== 0) { // 홀수 턴
                    reversalDamage = (this.getEffectiveStat('atk') + storedDamage) * 1.5;
                    reversalDamageType = 'physical';
                } else { // 짝수 턴
                    reversalDamage = (this.getEffectiveStat('matk') + storedDamage) * 1.5;
                    reversalDamageType = 'magical';
                }
                if (reversalDamage > 0) {
                    logFn(`✦역습✦ ${this.name}: ${attacker.name}에게 ${reversalDamage.toFixed(0)} ${reversalDamageType} 피해.`);
                    attacker.takeDamage(reversalDamage, logFn, this);
                }
                this.aggroDamageStored = 0;
                this.removeBuffById('reversal_active');
            }
        }
    
        const reflectBuff = this.buffs.find(b => b.effect.type === 'damage_reflect' && b.turnsLeft > 0);
        if (reflectBuff && attacker && attacker.isAlive) {
            const reflectedDamage = Math.max(0, netHpChange) * reflectBuff.effect.value; // 실제 체력 감소분 기반
            if (reflectedDamage > 0) {
                logFn(`✦피해 반사✦ ${this.name} [${reflectBuff.name} 효과]: ${attacker.name}에게 ${reflectedDamage.toFixed(0)} 피해 반사.`);
                attacker.takeDamage(reflectedDamage, logFn, this);
            }
        }
    
        // 체력 및 생존 상태 업데이트 로그
        if (this.currentHp <= 0) {
            this.currentHp = 0;
            if (prevIsAlive) { // 방금 죽었다면 (이전에 살아 있었는지 확인)
                logFn(`✦전투 불능✦ ${this.name}, 쓰러집니다.`);
            }
            this.isAlive = false;
        }
    
        // 디버깅 로그
        console.log("[DEBUG takeDamage] Before final HP log - typeof logFn:", typeof logFn, "Actual value of logFn:", logFn);
        logFn(`✦정보✦ ${this.name} HP: ${initialHp.toFixed(0)} → ${this.currentHp.toFixed(0)} (보호막: ${this.shield.toFixed(0)})`);
    
    } // takeDamage 함수의 끝

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
    character.currentTurnDamageTaken = 0; // 턴마다 받은 피해 초기화

    // 버프 효과 처리
    character.buffs = character.buffs.filter(buff => {
        if (buff.effect.type === 'turn_start_heal' && buff.turnsLeft > 0) {
            const healAmount = buff.effect.value;
            character.currentHp = Math.min(character.maxHp, character.currentHp + healAmount);
            logToBattleLog(`✦회복✦ ${character.name}, [${buff.name} 효과]: HP ${healAmount.toFixed(0)} 회복. (현재 HP: ${character.currentHp.toFixed(0)})`);
        }
        if (!buff.unremovable) buff.turnsLeft--;
        return buff.turnsLeft > 0 || buff.unremovable;
    });

    // 디버프 효과 처리
    character.debuffs = character.debuffs.filter(debuff => {
        if (debuff.id === 'poison' && debuff.turnsLeft > 0 && debuff.effect.type === 'fixed') {
            const poisonDamage = debuff.effect.damagePerTurn;
            logToBattleLog(`✦상태 피해✦ ${character.name}, [${debuff.name} 효과]: ${poisonDamage.toFixed(0)} 고정 피해.`);
            character.takeDamage(poisonDamage, logToBattleLog); 
        }
        debuff.turnsLeft--;
        return debuff.turnsLeft > 0;
    });
}

function processEndOfTurnEffects(actingChar) {
    // [허상] 스킬의 턴 종료 추가 공격 효과 처리
    const illusionBuff = actingChar.buffs.find(b => b.id === 'illusion_end_turn_attack' && b.turnsLeft > 0);
    if (illusionBuff) {
        const caster = findCharacterById(illusionBuff.effect.attackerId);
        const enemyTarget = findCharacterById(illusionBuff.effect.enemyTargetId);
        if (caster && enemyTarget && enemyTarget.isAlive) {
            const bonusDamage = calculateDamage(caster, enemyTarget, 0.5, 'physical'); // 공격력의 50% 물리 피해
            // 수정된 로그:
            logToBattleLog(`✦추가 공격✦ ${caster.name} [허상 턴 종료]: ${enemyTarget.name}에게 ${bonusDamage.toFixed(0)} 추가 물리 피해.`);
            enemyTarget.takeDamage(bonusDamage, logToBattleLog, caster);
        }
        actingChar.removeBuffById('illusion_end_turn_attack');
    }

    // [진리] 스킬의 턴 종료 추가 공격 효과 처리
    const truthMarkerBuff = actingChar.buffs.find(b => b.id === 'truth_caster_marker' && b.turnsLeft > 0);
    if (truthMarkerBuff) {
        const originalCaster = findCharacterById(truthMarkerBuff.effect.originalCasterId);
        const aliveEnemies = enemyCharacters.filter(e => e.isAlive);
        if (originalCaster && aliveEnemies.length > 0) {
            const randomEnemyTarget = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            const bonusDamage = calculateDamage(originalCaster, randomEnemyTarget, 0.3, 'physical'); // 시전자 공격력의 30% 물리 피해
            // 수정된 로그:
            logToBattleLog(`✦추가 공격✦ ${originalCaster.name} [진리 턴 종료]: ${randomEnemyTarget.name}에게 ${bonusDamage.toFixed(0)} 추가 물리 피해.`);
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
    currentTurn = 0; // 전투 시작 시 0턴으로 초기화
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
    // nextTurnButton.style.display = 'block'; // 이 버튼은 prepareNewTurnCycle에서 관리
    // executeTurnButton.style.display = 'none'; // 이 버튼은 showSkillSelectionForNextAlly에서 관리
    prepareNewTurnCycle(); // 전투 시작 시 첫 턴 준비
}

// 한 턴(아군 전체 + 적군 전체 행동)이 완전히 종료된 후 다음 턴을 준비하는 함수
function prepareNewTurnCycle() {
    if (!isBattleStarted) {
         alert('전투를 시작해 주세요. (prepareNewTurnCycle)');
         return;
    }
    currentTurn++;
    logToBattleLog(`\n=== ${currentTurn} 턴 행동 선택 시작 ===`);
    playerActionsQueue = [];
    currentActingCharacterIndex = 0;

    skillSelectionArea.style.display = 'none'; // 이전 턴의 선택 UI는 숨김
    executeTurnButton.style.display = 'none';
    nextTurnButton.style.display = 'block';    // '다음 턴 (스킬/이동 선택)' 버튼 표시 (실제로는 행동 선택 시작 버튼)

    if(skillSelectionArea) skillSelectionArea.style.display = 'none';
    if(executeTurnButton) executeTurnButton.style.display = 'none';
    if(nextTurnButton) nextTurnButton.style.display = 'block';
    if(skillDescriptionArea) skillDescriptionArea.innerHTML = ''; // 새 턴 준비 시 설명 영역 초기화
    
    // 첫 번째 아군의 행동 선택 UI를 보여주도록
    showSkillSelectionForNextAlly();
}


function prepareNextTurn() { // 이 함수는 이제 '다음 아군 행동 선택 UI 표시' 또는 '턴 실행 버튼 표시' 역할
    if (!isBattleStarted) { alert('전투를 시작해 주세요. (prepareNextTurn)'); return; }

    // 이 함수는 '다음 턴 (스킬/이동 선택)' 버튼 클릭 시 또는 confirmAction 후 호출됨
    // 즉, 다음 아군의 행동을 선택하게 하거나, 모든 아군 선택이 끝났으면 '턴 실행' 버튼을 보여줌.
    // currentTurn 증가나 playerActionsQueue 초기화는 여기서 하지 않음. (prepareNewTurnCycle에서 담당)

    const aliveAllies = allyCharacters.filter(a => a.isAlive);
    if (currentActingCharacterIndex >= aliveAllies.length) {
        // 모든 아군 행동 선택 완료
        logToBattleLog('모든 아군 캐릭터의 행동 선택이 완료되었습니다. 턴을 실행하세요.');
        skillSelectionArea.style.display = 'none';
        executeTurnButton.style.display = 'block';
        nextTurnButton.style.display = 'none';
    } else {
        // 다음 아군 행동 선택 UI 표시
        showSkillSelectionForNextAlly();
    }
}

function showSkillSelectionForNextAlly() {
    const aliveAllies = allyCharacters.filter(char => char.isAlive);
    if (currentActingCharacterIndex >= aliveAllies.length) {
        if (skillDescriptionArea) skillDescriptionArea.innerHTML = ''; // ⭐ 설명 영역 초기화
        return;
        // 이 경우는 prepareNextTurn에서 이미 처리함.
        // 방어적으로 여기서도 UI 처리.
        logToBattleLog('모든 아군 캐릭터의 행동 선택이 완료. (showSkillSelectionForNextAlly)');
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
                if (lastUsed !== 0 && currentTurn - lastUsed < 3) { // currentTurn은 현재 진행 중인 턴
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
    executeTurnButton.style.display = 'none'; // 행동 선택 중에는 턴 실행 버튼 숨김
    nextTurnButton.style.display = 'block';   // 다음 행동 선택자/턴 실행 UI로 넘어가는 버튼
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

    if (skillDescriptionArea) {
        skillDescriptionArea.innerHTML = `<strong>${skill.name}</strong>: ${skill.description || '설명 없음'}`;
    }
    
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

    if (skillDescriptionArea) skillDescriptionArea.innerHTML = '이동이 선택되었습니다.'; // 이동 선택 시 설명 영역 업데이트
    
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
    if (!selectedAction.type) {
        alert('행동을 선택해 주세요.');
        return;
    }

    const caster = findCharacterById(selectedAction.casterId);
    if (!caster) {
        alert('시전자를 찾을 수 없습니다.');
        return;
    }

    let actionDetails = { caster: caster, type: selectedAction.type };
    let targetDescription = "정보 없음"; // ⭐ 1. 변수 선언 및 초기값 할당

    if (selectedAction.type === 'skill') {
        const skill = SKILLS[selectedAction.skillId];
        if (!skill) {
            alert('선택된 스킬 정보를 찾을 수 없습니다.');
            return;
        }
        actionDetails.skill = skill;

        // ⭐ 2. 선택된 대상에 따라 targetDescription 값 설정 ⭐
        if (skill.targetSelection === 'self') {
            targetDescription = caster.name; // 자신 대상
            actionDetails.mainTarget = caster;
        } else if (skill.targetSelection === 'all_allies' || skill.targetSelection === 'all_enemies') {
            targetDescription = "전체 대상";
            // mainTarget 등은 execute 함수 내에서 allies/enemies 리스트로 처리됨
        } else if (selectedAction.targetId) { // 단일 대상 또는 다중 대상의 첫 번째 대상
            const mainTargetObj = findCharacterById(selectedAction.targetId);
            if (mainTargetObj) {
                targetDescription = mainTargetObj.name;
            } else {
                targetDescription = "알 수 없는 대상"; // 대상 ID는 있지만 객체를 찾지 못한 경우
            }
            actionDetails.mainTarget = mainTargetObj;

            if (skill.targetSelection === 'two_enemies' && selectedAction.subTargetId) {
                const subTargetObj = findCharacterById(selectedAction.subTargetId);
                if (subTargetObj) {
                    targetDescription += `, ${subTargetObj.name}`; // 부가 대상 이름 추가
                }
                actionDetails.subTarget = subTargetObj;
            }
        } else {
            // 대상을 선택해야 하는 스킬인데 targetId가 없는 경우
            targetDescription = "대상 미선택";
        }
        // ⭐ 4. 로그 메시지 수정 (HTML 태그 및 불필요한 이스케이프 문자 제거) ⭐
        logToBattleLog(`✦준비✦ ${caster.name}, [${skill.name}] 스킬 사용 준비. (대상: ${targetDescription})`);

    } else if (selectedAction.type === 'move') {
        actionDetails.moveDelta = selectedAction.moveDelta;
        // 이동 시에는 selectedAction.moveDelta가 null이 아닌지 확인하는 것이 중요
        if (!selectedAction.moveDelta) {
             console.error("confirmAction: Move action selected, but moveDelta is null!");
             alert("이동 정보 오류. 다시 선택해주세요.");
             selectedAction = { type: null, casterId: caster.id, skillId: null, targetId: null, subTargetId: null, moveDelta: null };
             showSkillSelectionForNextAlly();
             return;
        }

        const targetX = caster.posX + selectedAction.moveDelta.dx;
        const targetY = caster.posY + selectedAction.moveDelta.dy;

        // ⭐ 3. 이동(move) 타입 처리 시에는 스킬 대상 설정 로직이 필요 없음 (제거) ⭐
        // 아래 유효성 검사는 유지하거나, selectMove에서 이미 처리했다면 간소화 가능
        if (targetX < 1 || targetX > MAP_WIDTH || targetY < 1 || targetY > MAP_HEIGHT) { // 1기반 좌표계 가정
            logToBattleLog(`✦정보✦ ${caster.name}, 이동 불가: (${targetX},${targetY}) 맵 범위 이탈.`);
            alert("맵 경계를 벗어나는 이동은 확정할 수 없습니다.");
            selectedAction = { type: null, casterId: caster.id, skillId: null, targetId: null, subTargetId: null, moveDelta: null };
            showSkillSelectionForNextAlly(); 
            return;
        }
        if (characterPositions[`${targetX},${targetY}`] && characterPositions[`${targetX},${targetY}`] !== caster.id) {
            logToBattleLog(`✦정보✦ ${caster.name}, 이동 불가: (${targetX},${targetY}) 위치에 다른 캐릭터 있음.`);
            alert("다른 캐릭터가 있는 곳으로 이동은 확정할 수 없습니다.");
            selectedAction = { type: null, casterId: caster.id, skillId: null, targetId: null, subTargetId: null, moveDelta: null };
            showSkillSelectionForNextAlly(); 
            return;
        }
        // ⭐ 4. 로그 메시지 수정 (HTML 태그 및 불필요한 이스케이프 문자 제거) ⭐
        logToBattleLog(`✦준비✦ ${caster.name}, (${targetX},${targetY})(으)로 이동 준비.`);
    }

    if (skillDescriptionArea) skillDescriptionArea.innerHTML = ''; 
    
    playerActionsQueue.push(actionDetails);
    currentActingCharacterIndex++;
    prepareNextTurn(); 
}

async function executeSingleAction(action) {
    const caster = action.caster;
    // if (!caster || !caster.isAlive) return; // 이 조건은 아래에서 false를 반환하도록 수정
    if (!caster || !caster.isAlive) {
        console.log(`[DEBUG] executeSingleAction: Caster ${caster ? caster.name : 'N/A'} is not alive or not found. Returning false.`);
        return false; // 루프 계속을 위해 false 반환
    }

    applyTurnStartEffects(caster);

    logToBattleLog(`\n--- <span class="math-inline">\{caster\.name\} 행동 \(</span>{currentTurn}턴) ---`);

    if (action.type === 'skill') {
        const skill = action.skill;
        logToBattleLog(`✦스킬✦ <span class="math-inline">\{caster\.name\}, \[</span>{skill.name}] 주문 발동!`);
        let skillSuccess = true; // 기본값을 true로. 스킬 실행 결과가 false일 때만 false로.
        if (skill.execute) {
            let mainTarget = action.mainTarget;
            let subTarget = action.subTarget;
            let actualAllies = allyCharacters.filter(a => a.isAlive);
            let actualEnemies = enemyCharacters.filter(e => e.isAlive);

            // executeSingleAction 함수 내부의 스킬 실행 부분
console.log(`[DEBUG] executeSingleAction: Attempting to execute skill: ${skill.name} by ${caster.name}, targetType: ${skill.targetType}`);

            switch (skill.targetType) {
                case 'self':
                    if (skill.id === SKILLS.SKILL_PROVOKE.id || skill.id === SKILLS.SKILL_REALITY.id) {
                        // 이 스킬들은 execute(caster, allies, enemies, battleLog) 시그니처를 사용
                        skillSuccess = skill.execute(caster, actualAllies, actualEnemies, logToBattleLog);
                    } else { // SKILL_RESILIENCE, SKILL_REVERSAL 등. 이들은 execute(caster, target=caster, allies, enemies, battleLog)
                        skillSuccess = skill.execute(caster, caster, actualAllies, actualEnemies, logToBattleLog);
                    }
                    break;
                case 'all_enemies': // 예: SKILL_TRUTH는 execute(caster, enemies, battleLog) 시그니처
                    skillSuccess = skill.execute(caster, actualEnemies, logToBattleLog);
                    break;
                case 'all_allies': // 예: SKILL_COUNTER는 execute(caster, allies, enemies, battleLog) 시그니처
                    skillSuccess = skill.execute(caster, actualAllies, actualEnemies, logToBattleLog);
                    break;
                // '간파'(single_enemy)와 '허상'(single_ally_or_self)
                case 'single_enemy':
                case 'single_ally_or_self':
                case 'single_ally':
                    // 이 스킬들은 대부분 execute(caster, target, allies, enemies, battleLog) 시그니처를 가집니다.
                    // mainTarget이 target으로, actualAllies가 allies로, actualEnemies가 enemies로, logToBattleLog가 battleLog로 매칭됩니다.
                    skillSuccess = skill.execute(caster, mainTarget, actualAllies, actualEnemies, logToBattleLog);
                    break;
                case 'multi_enemy': // 예: SKILL_RUPTURE는 (caster, mainTarget, subTarget, allies, enemies, battleLog)
                    skillSuccess = skill.execute(caster, mainTarget, subTarget, actualAllies, actualEnemies, logToBattleLog);
                    break;
                default:
                    console.warn(`[WARN] Unknown/Unhandled skill targetType: ${skill.targetType} for skill ${skill.name}. Using default call signature.`);
                    // 가장 일반적인 (가장 많은 파라미터를 가진) 형태로 호출 시도
                    skillSuccess = skill.execute(caster, mainTarget, subTarget, actualAllies, actualEnemies, logToBattleLog);
                    break;
            }
            console.log(`[DEBUG] executeSingleAction: Skill ${skill.name} execution finished. skillSuccess = ${skillSuccess}`);

        }

        // skillSuccess가 명시적으로 false인 경우만 실패로 간주
        if (skillSuccess === false) {
            logToBattleLog(`${skill.name} 사용에 실패했습니다.`);
        } else {
            // undefined 이거나 true인 경우 (즉, 명시적 실패가 아닌 경우)
            caster.lastSkillTurn[skill.id] = currentTurn;
        }

    } else if (action.type === 'move') {
        const oldX = caster.posX; const oldY = caster.posY;
        // 이동 확정 시 이미 검사했지만, 한 번 더 확인 (이동 로직 자체는 selectMove에서 이미 유효성 검사됨)
        let newX = caster.posX + action.moveDelta.dx;
        let newY = caster.posY + action.moveDelta.dy;

        // 실제 이동 실행 전 최종 경계 및 점유 검사 (중복될 수 있으나 안전장치)
        if (newX < 0 || newX >= MAP_WIDTH || newY < 0 || newY >= MAP_HEIGHT) {
            logToBattleLog(`❗ ${caster.name}의 이동 실행 실패: (${newX},${newY})는 맵 범위를 벗어납니다.`);
        } else if (characterPositions[`${newX},${newY}`] && characterPositions[`${newX},${newY}`] !== caster.id) {
            logToBattleLog(`❗ ${caster.name}의 이동 실행 실패: (${newX},${newY})에 다른 캐릭터가 있습니다.`);
        } else {
            if (oldX !== -1 && oldY !== -1) delete characterPositions[`${oldX},${oldY}`];
            caster.posX = newX; caster.posY = newY;
            characterPositions[`${newX},${newY}`] = caster.id;
            logToBattleLog(`✦이동✦ ${caster.name}, (${oldX},${oldY})에서 (${newX},${newY})(으)로 이동 완료.`);
            console.log(`[DEBUG] executeSingleAction: Character ${caster.name} moved to (${newX},${newY}).`);
        }
    }

    processEndOfTurnEffects(caster);
    displayCharacters();

    console.log(`[DEBUG] executeSingleAction: About to call checkBattleEnd() for ${caster.name}.`);
    if (checkBattleEnd()) {
        console.log(`[DEBUG] executeSingleAction: checkBattleEnd() returned true for ${caster.name}. Battle ends. Returning true.`);
        return true;
    }

    console.log(`[DEBUG] executeSingleAction: Action for ${caster.name} completed. Returning false to continue turn sequence.`);
    return false;
}

async function executeBattleTurn() {
    // '턴 실행' 버튼 클릭 시 호출
    if (!isBattleStarted) { alert('전투를 시작해 주세요. (executeBattleTurn)'); return; }
    const aliveAlliesCount = allyCharacters.filter(c => c.isAlive).length;
    if (playerActionsQueue.length < aliveAlliesCount && aliveAlliesCount > 0) {
         alert('모든 살아 있는 아군의 행동을 선택해 주세요.');
         return;
    }

    if(skillSelectionArea) skillSelectionArea.style.display = 'none';
    if(executeTurnButton) executeTurnButton.style.display = 'none';
    if(skillDescriptionArea) skillDescriptionArea.innerHTML = ''; // 턴 실행 시 설명 영역 초기화

    console.log(`[DEBUG] executeBattleTurn: Starting turn ${currentTurn}. Player actions in queue: ${playerActionsQueue.length}`);
    skillSelectionArea.style.display = 'none';
    executeTurnButton.style.display = 'none';

    logToBattleLog(`\n--- ${currentTurn} 턴 아군 행동 실행 ---`);
    for (const action of playerActionsQueue) {
        console.log(`[DEBUG] executeBattleTurn: Ally action for ${action.caster.name}, type: ${action.type}`);
        if (await executeSingleAction(action)) {
            console.log(`[DEBUG] executeBattleTurn: Battle ended during ally turn.`);
            return; 
        }
        console.log(`[DEBUG] executeBattleTurn: Action processed for ${action.caster.name}. Continuing to next action if any.`);
    }
    console.log(`[DEBUG] executeBattleTurn: All ally actions completed for turn ${currentTurn}.`);

    logToBattleLog(`\n--- ${currentTurn} 턴 적군 행동 실행 ---`);
    for (const enemyChar of enemyCharacters) {
        if (enemyChar.isAlive) {
            console.log(`[DEBUG] executeBattleTurn: Enemy action for ${enemyChar.name}`);
            if (await performEnemyAction(enemyChar)) {
                console.log(`[DEBUG] executeBattleTurn: Battle ended during enemy turn.`);
                return; 
            }
        }
    }
    console.log(`[DEBUG] executeBattleTurn: All enemy actions completed for turn ${currentTurn}.`);

    console.log(`[DEBUG] executeBattleTurn: End of turn ${currentTurn}. About to check conditions for new turn preparation.`);
    if (!checkBattleEnd() && isBattleStarted) { 
        console.log(`[DEBUG] executeBattleTurn: Preparing new turn cycle.`);
        prepareNewTurnCycle(); 
    } else {
        console.log(`[DEBUG] executeBattleTurn: Battle ended or not started after turn ${currentTurn}. Not preparing new turn. isBattleStarted: ${isBattleStarted}`);
        if (!isBattleStarted && startButton) startButton.style.display = 'block'; 
        if (executeTurnButton) executeTurnButton.style.display = 'none';
        if (nextTurnButton) nextTurnButton.style.display = 'none';
    }
}

async function performEnemyAction(enemyChar) {
    applyTurnStartEffects(enemyChar); // 턴 시작 효과 적용 (내부 로그는 이미 수정됨)
    // 수정된 로그:
    logToBattleLog(`\n--- ${enemyChar.name} (AI) 행동 (${currentTurn}턴) ---`);

    let targetAlly = null; // 플레이어의 아군 중 공격 대상
    const provokeDebuffOnEnemy = enemyChar.debuffs.find(d => d.id === 'provoked' && d.turnsLeft > 0);
    if (provokeDebuffOnEnemy) {
        targetAlly = findCharacterById(provokeDebuffOnEnemy.effect.targetId);
        if (!targetAlly || !targetAlly.isAlive) {
            targetAlly = null; // 도발 대상이 죽었거나 유효하지 않으면 타겟 해제
            logToBattleLog(`✦정보✦ ${enemyChar.name} (AI): 도발 대상이 유효하지 않아 새로운 대상을 탐색합니다.`);
        } else {
            logToBattleLog(`✦정보✦ ${enemyChar.name} (AI): [도발] 효과로 ${targetAlly.name}을(를) 우선 공격합니다.`);
        }
    }

    if (!targetAlly) {
        const aliveAllies = allyCharacters.filter(a => a.isAlive);
        if (aliveAllies.length > 0) {
            // 가장 체력이 낮은 아군을 대상으로 단순 AI
            targetAlly = aliveAllies.reduce((min, char) => (char.currentHp < min.currentHp ? char : min), aliveAllies[0]);
        }
    }

    if (targetAlly) {
        // 예고된 스킬 사용 (Mapdata.js 및 관련 로직 구현 후 사용)
        // const skillToUse = enemyChar.nextSkillToUse; 
        
        // 현재 로직: 사용 가능한 스킬 중 랜덤 선택
        const usableSkills = enemyChar.skills.map(id => SKILLS[id]).filter(s => s && 
            !(s.id === SKILLS.SKILL_REALITY.id && enemyChar.lastSkillTurn[s.id] && currentTurn - enemyChar.lastSkillTurn[s.id] < 3) // 예시: 실존 쿨타임 체크
        );
        let skillToUse = null;
        if (usableSkills.length > 0) {
            skillToUse = usableSkills[Math.floor(Math.random() * usableSkills.length)];
        }

        const aiTargetName = targetAlly.name; // 로그용 대상 이름

        if (skillToUse) {
            // 수정된 로그:
            logToBattleLog(`🔥 ${enemyChar.name} (AI), [${skillToUse.name}] 시전! (대상: ${skillToUse.targetType.includes("enemy") || skillToUse.targetType.includes("multi") ? aiTargetName : (skillToUse.targetType.includes("ally") ? "아군(적)" : "자신") })`);
            
            let alliesForEnemySkill = allyCharacters.filter(a => a.isAlive); // 적의 입장에서는 플레이어 아군들이 '적 리스트'
            let enemiesForEnemySkill = enemyCharacters.filter(e => e.isAlive); // 적의 입장에서는 다른 적들이 '아군 리스트'

            // 스킬 타입에 따른 실행 (이전 답변의 switch 문 참고)
            // 이 부분은 executeSingleAction의 스킬 호출 switch문과 매우 유사하게 구성되어야 합니다.
            // 각 스킬의 execute 함수가 기대하는 파라미터 순서대로 전달해야 합니다.
            switch (skillToUse.targetType) {
                case 'self':
                    if (skillToUse.id === SKILLS.SKILL_PROVOKE.id || skillToUse.id === SKILLS.SKILL_REALITY.id) {
                        skillToUse.execute(enemyChar, enemiesForEnemySkill, alliesForEnemySkill, logToBattleLog);
                    } else { 
                        skillToUse.execute(enemyChar, enemyChar, enemiesForEnemySkill, alliesForEnemySkill, logToBattleLog);
                    }
                    break;
                case 'all_enemies': // 적 AI의 '모든 적'은 플레이어의 아군들
                    skillToUse.execute(enemyChar, alliesForEnemySkill, logToBattleLog);
                    break;
                case 'all_allies': // 적 AI의 '모든 아군'은 다른 적 캐릭터들
                    skillToUse.execute(enemyChar, enemiesForEnemySkill, alliesForEnemySkill, logToBattleLog);
                    break;
                case 'single_enemy': // 적 AI의 '단일 적'은 플레이어 아군 중 하나 (targetAlly)
                    skillToUse.execute(enemyChar, targetAlly, enemiesForEnemySkill, alliesForEnemySkill, logToBattleLog);
                    break;
                case 'single_ally_or_self': // 적 AI가 자신 또는 다른 적에게 사용
                    // AI 로직: 자신에게 이로운 효과면 자신, 아니면 다른 적에게 (여기서는 단순화)
                    let selfOrAllyTarget = enemyChar; // 기본은 자신
                    if (skillToUse.id === SKILLS.SKILL_ILLUSION.id && enemiesForEnemySkill.length > 1) { // 예: 허상 - 다른 적이 있으면 그 적에게 버프
                        let otherEnemy = enemiesForEnemySkill.find(e => e.id !== enemyChar.id);
                        if(otherEnemy) selfOrAllyTarget = otherEnemy;
                    }
                    skillToUse.execute(enemyChar, selfOrAllyTarget, enemiesForEnemySkill, alliesForEnemySkill, logToBattleLog);
                    break;
                case 'single_ally': // 적 AI의 '단일 아군'은 다른 적 캐릭터 중 하나
                    let friendlyEnemyTarget = enemiesForEnemySkill.find(e => e.id !== enemyChar.id);
                    if (!friendlyEnemyTarget && enemiesForEnemySkill.length > 0) friendlyEnemyTarget = enemyChar; // 다른 동료 없으면 자신
                    
                    if (friendlyEnemyTarget) {
                         skillToUse.execute(enemyChar, friendlyEnemyTarget, enemiesForEnemySkill, alliesForEnemySkill, logToBattleLog);
                    } else {
                         logToBattleLog(`✦정보✦ ${enemyChar.name} (AI) [${skillToUse.name}]: 대상 아군(적)을 찾을 수 없습니다.`);
                    }
                    break;
                case 'multi_enemy': // 주 대상은 targetAlly, 부 대상은 다른 플레이어 아군
                    let subTargetForMulti = alliesForEnemySkill.find(a => a.isAlive && a.id !== targetAlly.id);
                    skillToUse.execute(enemyChar, targetAlly, subTargetForMulti, enemiesForEnemySkill, alliesForEnemySkill, logToBattleLog);
                    break;
                default:
                    logToBattleLog(`✦정보✦ ${enemyChar.name} (AI) [${skillToUse.name}]: 스킬 대상 타입(${skillToUse.targetType}) AI 실행 미지원. ${aiTargetName}에게 기본 공격.`);
                    const damage = calculateDamage(enemyChar, targetAlly, 1.0, 'physical');
                    targetAlly.takeDamage(damage, logToBattleLog, enemyChar);
                    break;
            }
        } else if (targetAlly) { // 사용할 스킬이 없으면 기본 공격
            logToBattleLog(`✦정보✦ ${enemyChar.name} (AI), ${aiTargetName}에게 기본 공격.`);
            const damage = calculateDamage(enemyChar, targetAlly, 1.0, 'physical');
            targetAlly.takeDamage(damage, logToBattleLog, enemyChar);
        } else {
            logToBattleLog(`✦정보✦ ${enemyChar.name} (AI): 공격할 대상이 없습니다.`);
        }
    } else { // 공격할 플레이어 아군이 없음
        logToBattleLog(`✦정보✦ ${enemyChar.name} (AI): 공격할 대상(플레이어 아군)이 없습니다.`);
    }

    // enemyChar.nextSkillToUse = null; // Mapdata.js 스킬 예고 기능 사용 시 주석 해제
    processEndOfTurnEffects(enemyChar);
    displayCharacters(); // 캐릭터 카드 업데이트 (예고 스킬 표시 등)
    return checkBattleEnd();
}

function checkBattleEnd() {
    const allEnemiesDead = enemyCharacters.every(char => !char.isAlive);
    const allAlliesDead = allyCharacters.every(char => !char.isAlive);

    console.log(`[DEBUG] checkBattleEnd: allEnemiesDead=${allEnemiesDead} (Total Enemies: ${enemyCharacters.length}), allAlliesDead=${allAlliesDead} (Total Allies: ${allyCharacters.length})`);

    if (enemyCharacters.length > 0 && allEnemiesDead) { // 적이 있었는데 다 죽음
        logToBattleLog('--- 모든 적을 물리쳤습니다. 전투 승리! 🎉 ---');
        endBattle();
        console.log(`[DEBUG] checkBattleEnd: All enemies dead. Returning true.`);
        return true;
    } else if (allyCharacters.length > 0 && allAlliesDead) { // 아군이 있었는데 다 죽음
        logToBattleLog('--- 모든 아군이 쓰러졌습니다. 전투 패배! 😭 ---');
        endBattle();
        console.log(`[DEBUG] checkBattleEnd: All allies dead. Returning true.`);
        return true;
    }
    // console.log(`[DEBUG] checkBattleEnd: No win/loss condition met. Returning false.`);
    return false;
}

function endBattle() {
    isBattleStarted = false;
    logToBattleLog("--- 전투 종료 ---"); // 명확한 로그 추가

    if (startButton) startButton.style.display = 'block';
    if (nextTurnButton) nextTurnButton.style.display = 'none';
    if (executeTurnButton) executeTurnButton.style.display = 'none';
    if (skillSelectionArea) skillSelectionArea.style.display = 'none';

    // 필요하다면 캐릭터 상태 초기화나 추가 정리 작업
    currentTurn = 0; // 턴 번호 초기화
    playerActionsQueue = [];
    currentActingCharacterIndex = 0;
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
    const enemy2 = new Character("오아아", "암석");
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
    // 초기 버튼 상태 설정
    if (startButton) startButton.style.display = 'block';
    if (nextTurnButton) nextTurnButton.style.display = 'none';
    if (executeTurnButton) executeTurnButton.style.display = 'none';
    if (skillSelectionArea) skillSelectionArea.style.display = 'none';
});
