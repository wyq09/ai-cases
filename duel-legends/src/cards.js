(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DuelCards = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CARDS = {
    cinder_gear_hound: {
      id: 'cinder_gear_hound', name: '熔芯齿轮犬', type: 'monster', level: 3,
      atk: 1400, def: 900, attribute: '炎', race: '机械', icon: '犬',
      desc: '胸腔里燃着微小炉火，循着金属气味奔跑的造灵。'
    },
    kiln_carrier_crab: {
      id: 'kiln_carrier_crab', name: '炉膛搬运蟹', type: 'monster', level: 4,
      atk: 1500, def: 1800, attribute: '炎', race: '机械', icon: '蟹',
      desc: '以双钳搬动灼热砖块，背甲就是一座行走的窑。'
    },
    spark_kite: {
      id: 'spark_kite', name: '火花纸鸢', type: 'monster', level: 2,
      atk: 800, def: 1200, attribute: '风', race: '机械', icon: '筝',
      desc: '薄铜骨架乘着热流升高，长尾洒落不会伤人的星火。'
    },
    copperbell_ram: {
      id: 'copperbell_ram', name: '铜铃冲角羊', type: 'monster', level: 4,
      atk: 1700, def: 1000, attribute: '地', race: '兽', icon: '羊',
      desc: '颈铃一响便埋头冲刺，弯角上刻着矿工的护符。'
    },
    magnet_wing_swallow: {
      id: 'magnet_wing_swallow', name: '磁翼雨燕', type: 'monster', level: 3,
      atk: 1200, def: 1400, attribute: '风', race: '鸟兽', icon: '燕',
      desc: '剪开烟云的灵巧身影，总能找回遗落的螺钉与齿轮。'
    },
    furnace_tortoise: {
      id: 'furnace_tortoise', name: '熔炉背甲龟', type: 'monster', level: 6,
      atk: 2200, def: 2400, attribute: '炎', race: '机械', icon: '龟',
      desc: '缓慢爬行时地脉随之升温，厚重炉甲足以封住爆裂。'
    },
    railhorn_rhino: {
      id: 'railhorn_rhino', name: '轨角铁犀', type: 'monster', level: 5,
      atk: 2100, def: 1600, attribute: '地', race: '机械', icon: '犀',
      desc: '沿废弃矿轨巡视的巨兽，独角会铺出新的赤红轨道。'
    },
    sunforge_dragon: {
      id: 'sunforge_dragon', name: '曜日铸龙', type: 'monster', level: 8,
      atk: 2900, def: 2500, attribute: '炎', race: '龙', icon: '龙', piercing: true,
      desc: '贯穿：攻击守备怪兽时，给予攻击力超过其守备力的战斗伤害。吞下游移的日光，再以呼吸锻成鳞甲的巨龙。'
    },
    nine_light_engine: {
      id: 'nine_light_engine', name: '九曜天车', type: 'monster', level: 7,
      atk: 2600, def: 2100, attribute: '光', race: '机械', icon: '车',
      desc: '九枚光轮围绕无马车厢旋转，载着黎明驶过长夜。'
    },
    furnace_refit: {
      id: 'furnace_refit', name: '炉心整备', type: 'spell', icon: '修',
      desc: '熄灭杂音，让炉火重新平稳。自己回复1200点生命。',
      effect: { kind: 'heal', value: 1200 }
    },
    spark_relay: {
      id: 'spark_relay', name: '火花接力', type: 'spell', icon: '引',
      desc: '把一粒火花送往下一盏灯。自己从卡组抽1张卡。',
      effect: { kind: 'draw', value: 1 }
    },
    molten_overdrive: {
      id: 'molten_overdrive', name: '熔流超荷', type: 'spell', icon: '燃',
      desc: '让熔流贯通装甲。装备怪兽的攻击力上升700点。',
      effect: { kind: 'equip', value: 700 }
    },
    slag_counter: {
      id: 'slag_counter', name: '炉渣反崩', type: 'trap', icon: '崩',
      desc: '对方怪兽攻击时发动，破坏那只攻击怪兽。',
      effect: { kind: 'destroyAttacker' }
    },

    reed_flute_deer: {
      id: 'reed_flute_deer', name: '芦笛灵鹿', type: 'monster', level: 3,
      atk: 1300, def: 1100, attribute: '风', race: '兽', icon: '鹿',
      desc: '蹄声像芦笛短句，走过之处会生出青色芦苇。'
    },
    mist_scale_carp: {
      id: 'mist_scale_carp', name: '雾鳞鲤', type: 'monster', level: 2,
      atk: 700, def: 1300, attribute: '水', race: '水族', icon: '鲤',
      desc: '在晨雾中游弋的小鲤，鳞片收藏着尚未落下的雨。'
    },
    pine_crown_crane: {
      id: 'pine_crown_crane', name: '松冠仙鹤', type: 'monster', level: 4,
      atk: 1600, def: 1200, attribute: '风', race: '鸟兽', icon: '鹤',
      desc: '头顶生着一簇不老松针，振翅时带起清越山风。'
    },
    stone_guard_ape: {
      id: 'stone_guard_ape', name: '磊石守猿', type: 'monster', level: 4,
      atk: 1800, def: 1500, attribute: '地', race: '兽', icon: '猿',
      desc: '把圆润山石叠成山门，安静守望每一位过路旅人。'
    },
    rain_listener_fox: {
      id: 'rain_listener_fox', name: '听雨狐', type: 'monster', level: 3,
      atk: 1100, def: 1500, attribute: '水', race: '兽', icon: '狐',
      desc: '能从千万滴雨声里辨出远方的脚步，尾尖常凝着水珠。'
    },
    tide_mystic_turtle: {
      id: 'tide_mystic_turtle', name: '潮汐玄龟', type: 'monster', level: 6,
      atk: 2000, def: 2600, attribute: '水', race: '水族', icon: '潮',
      desc: '背纹与月相一同变化，呼吸之间牵引海湾的潮汐。'
    },
    thunder_branch_elk: {
      id: 'thunder_branch_elk', name: '惊雷枝角麟', type: 'monster', level: 5,
      atk: 2300, def: 1700, attribute: '光', race: '兽', icon: '雷',
      desc: '枝状角间跳跃着亮色电弧，奔行如一声贴地惊雷。'
    },
    cloud_sea_whale: {
      id: 'cloud_sea_whale', name: '云海浮鲸', type: 'monster', level: 8,
      atk: 2800, def: 2800, attribute: '水', race: '水族', icon: '鲸',
      desc: '以云层为海的温柔巨鲸，歌声会化作绵长细雨。'
    },
    verdant_ridge_dragon: {
      id: 'verdant_ridge_dragon', name: '苍峦木蛟', type: 'monster', level: 7,
      atk: 2700, def: 2200, attribute: '地', race: '龙', icon: '木',
      desc: '沉睡时仿佛苍翠山岭，苏醒便舒展成遮天木蛟。'
    },
    bamboo_reverie: {
      id: 'bamboo_reverie', name: '竹林同梦', type: 'spell', icon: '竹',
      desc: '借一片竹林回应彼此。自己场上全部怪兽的攻击力上升300点。',
      effect: { kind: 'buffAll', value: 300 }
    },
    clear_spring_return: {
      id: 'clear_spring_return', name: '清泉回契', type: 'spell', icon: '泉',
      desc: '让旧日契约随泉流归来。将自己墓地最近送入的1只怪兽特殊召唤。',
      effect: { kind: 'revive' }
    },
    mountain_seal_script: {
      id: 'mountain_seal_script', name: '山篆镇灵', type: 'spell', icon: '镇',
      desc: '以沉稳山意压住锋芒。对方场上全部怪兽的攻击力下降600点。',
      effect: { kind: 'weaken', value: 600 }
    },
    water_mirror_return: {
      id: 'water_mirror_return', name: '水镜返照', type: 'trap', icon: '镜',
      desc: '对方怪兽攻击时发动，无效此次攻击并给予对方其攻击力数值的伤害。',
      effect: { kind: 'mirrorDamage' }
    },

    lantern_scribe: {
      id: 'lantern_scribe', name: '守灯小篆', type: 'monster', level: 3,
      atk: 1200, def: 1000, attribute: '暗', race: '魔法师', icon: '灯',
      desc: '从旧灯笼里诞生的字符精，替夜行者保存名字。'
    },
    folded_ink_moth: {
      id: 'folded_ink_moth', name: '折纸墨蛾', type: 'monster', level: 2,
      atk: 900, def: 800, attribute: '风', race: '昆虫', icon: '蛾',
      desc: '翅膀是两页折起的薄纸，抖落的鳞粉像未干的墨。'
    },
    inkblade_page: {
      id: 'inkblade_page', name: '墨刃书童', type: 'monster', level: 4,
      atk: 1700, def: 900, attribute: '暗', race: '战士', icon: '墨',
      desc: '以长毫作剑的书童，每一笔都在空中留下利落墨痕。'
    },
    wellside_spirit_cat: {
      id: 'wellside_spirit_cat', name: '井畔灵猫', type: 'monster', level: 4,
      atk: 1500, def: 1600, attribute: '水', race: '兽', icon: '猫',
      desc: '守着古井与水中倒影，能察觉被刻意遗忘的呼唤。'
    },
    ash_memory_crow: {
      id: 'ash_memory_crow', name: '拾灰忆鸦', type: 'monster', level: 3,
      atk: 1400, def: 1200, attribute: '风', race: '鸟兽', icon: '鸦',
      desc: '收集冷却纸灰的鸦，羽间藏着信笺最后的余温。'
    },
    midnight_astrologer: {
      id: 'midnight_astrologer', name: '子夜星盘师', type: 'monster', level: 6,
      atk: 2300, def: 2000, attribute: '暗', race: '魔法师', icon: '星',
      desc: '用墨色星盘记录无星之夜，推算尚未发生的梦。'
    },
    tide_eye_sage: {
      id: 'tide_eye_sage', name: '观潮目贤者', type: 'monster', level: 5,
      atk: 2000, def: 2200, attribute: '水', race: '魔法师', icon: '目',
      desc: '闭目便能看见千里之外的海，袖口总带着咸湿潮气。'
    },
    long_night_stag: {
      id: 'long_night_stag', name: '墨渊长夜鹿', type: 'monster', level: 8,
      atk: 3000, def: 2400, attribute: '暗', race: '兽', icon: '夜',
      desc: '角上悬着碎月般的微光，四蹄踏过处展开静谧长夜。'
    },
    hollow_moon_serpent: {
      id: 'hollow_moon_serpent', name: '虚月环蛇', type: 'monster', level: 7,
      atk: 2600, def: 2600, attribute: '光', race: '龙', icon: '月',
      desc: '首尾相衔围成一轮空月，躯体里流动着银色薄雾。'
    },
    black_seal_bolt: {
      id: 'black_seal_bolt', name: '玄印飞锋', type: 'spell', icon: '印',
      desc: '把凝成锋刃的墨印送向对手。给予对方800点伤害。',
      effect: { kind: 'damage', value: 800 }
    },
    erasing_talisman: {
      id: 'erasing_talisman', name: '消字符箓', type: 'spell', icon: '消',
      desc: '抹去维系术式的最后一笔。破坏对方场上1张魔法或陷阱卡。',
      effect: { kind: 'destroySpell' }
    },
    forbidden_redaction: {
      id: 'forbidden_redaction', name: '禁句删定', type: 'spell', icon: '禁',
      desc: '从篇章中删去一个名字。破坏对方场上1只怪兽。',
      effect: { kind: 'destroyMonster' }
    },
    blank_page_barrier: {
      id: 'blank_page_barrier', name: '留白障页', type: 'trap', icon: '白',
      desc: '对方怪兽攻击时发动，使那次攻击无效。',
      effect: { kind: 'negateAttack' }
    }
  };

  const DECKS = [
    {
      id: 'ember_workshop',
      name: '赤炉巡游',
      desc: '以坚韧机械稳住阵线，用装备与炉火逐步压倒对手。',
      cards: [
        'cinder_gear_hound', 'cinder_gear_hound',
        'kiln_carrier_crab', 'kiln_carrier_crab',
        'spark_kite', 'spark_kite',
        'copperbell_ram', 'copperbell_ram',
        'furnace_tortoise', 'railhorn_rhino',
        'sunforge_dragon', 'nine_light_engine',
        'furnace_refit', 'furnace_refit',
        'spark_relay', 'spark_relay',
        'molten_overdrive', 'molten_overdrive',
        'slag_counter', 'slag_counter'
      ]
    },
    {
      id: 'cloud_mountain_pact',
      name: '云山灵契',
      desc: '借山川灵兽争夺场面，以群体强化和墓地回契延续攻势。',
      cards: [
        'reed_flute_deer', 'reed_flute_deer',
        'mist_scale_carp', 'mist_scale_carp',
        'pine_crown_crane', 'pine_crown_crane',
        'stone_guard_ape', 'stone_guard_ape',
        'tide_mystic_turtle', 'thunder_branch_elk',
        'cloud_sea_whale', 'verdant_ridge_dragon',
        'bamboo_reverie', 'bamboo_reverie',
        'clear_spring_return', 'clear_spring_return',
        'mountain_seal_script', 'mountain_seal_script',
        'water_mirror_return', 'water_mirror_return'
      ]
    },
    {
      id: 'ink_night_archive',
      name: '墨夜秘藏',
      desc: '操纵墨术干扰对方，用直接伤害与削除效果掌控节奏。',
      cards: [
        'lantern_scribe', 'lantern_scribe',
        'folded_ink_moth', 'folded_ink_moth',
        'inkblade_page', 'inkblade_page',
        'wellside_spirit_cat', 'wellside_spirit_cat',
        'midnight_astrologer', 'tide_eye_sage',
        'long_night_stag', 'hollow_moon_serpent',
        'black_seal_bolt', 'black_seal_bolt',
        'erasing_talisman', 'erasing_talisman',
        'forbidden_redaction', 'forbidden_redaction',
        'blank_page_barrier', 'blank_page_barrier'
      ]
    }
  ];

  return { CARDS, DECKS };
});
