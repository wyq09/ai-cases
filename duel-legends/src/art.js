(function (root) {
  'use strict';

  var TYPES = {
    monster: { top: '#18365a', bottom: '#07111f', accent: '#f6c85f', glow: '#70d7ff', ink: '#091321' },
    spell: { top: '#12645f', bottom: '#071f2b', accent: '#8df5ce', glow: '#70dfff', ink: '#062126' },
    trap: { top: '#72244f', bottom: '#210d2c', accent: '#ff9ac2', glow: '#c394ff', ink: '#250d29' }
  };

  var ATTRIBUTES = {
    fire: ['#ffcb66', '#f04b36'],
    water: ['#80ecff', '#3478e5'],
    earth: ['#e5bb75', '#7d6847'],
    wind: ['#b8f5c8', '#38a990'],
    light: ['#fff5b0', '#e6a942'],
    dark: ['#d6a0ff', '#7043a8'],
    divine: ['#fff8cf', '#e9bd4d']
  };

  function hash(value) {
    var text = String(value == null ? '' : value);
    var result = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      result ^= text.charCodeAt(i);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function key(value) {
    return String(value == null ? '' : value).toLowerCase();
  }

  function attribute(value) {
    var name = key(value);
    if (/fire|flame|pyro|火|炎/.test(name)) return 'fire';
    if (/water|aqua|ice|水|冰/.test(name)) return 'water';
    if (/earth|rock|ground|地|岩/.test(name)) return 'earth';
    if (/wind|air|风|風/.test(name)) return 'wind';
    if (/divine|god|神/.test(name)) return 'divine';
    if (/light|holy|光|圣|聖/.test(name)) return 'light';
    return 'dark';
  }

  function uri(svg) {
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.replace(/>\s+</g, '><').trim());
  }

  function stars(seed, color) {
    var out = '';
    for (var i = 0; i < 12; i += 1) {
      var x = 24 + ((seed >>> (i % 16)) + i * 47) % 272;
      var y = 24 + ((seed >>> ((i + 5) % 16)) + i * 31) % 238;
      var r = 2 + (i % 3);
      out += '<path d="M' + x + ' ' + (y - r * 2) + 'L' + (x + r) + ' ' + y + 'L' + x + ' ' + (y + r * 2) + 'L' + (x - r) + ' ' + y + 'Z" fill="' + color + '" opacity="' + (0.25 + (i % 4) * 0.12).toFixed(2) + '"/>';
    }
    return out;
  }

  function monsterShape(kind, p) {
    var common = ' fill="url(#figure)" stroke="' + p.accent + '" stroke-width="3" stroke-linejoin="round"';
    if (/dragon|serpent|wyvern|龙|龍/.test(kind)) {
      return '<g>' +
        '<path d="M73 240Q38 186 61 122Q92 145 120 176Q104 123 128 78L157 111L184 70Q213 120 196 172Q237 137 266 121Q279 183 235 237L201 212L184 278H125L112 216Z" fill="' + p.ink + '" opacity=".65"/>' +
        '<path d="M105 235Q83 193 115 159L91 139L128 137Q122 105 148 84L158 112L179 89L184 125Q221 141 209 180Q205 196 190 202L223 228L196 231L176 213L173 276H126L129 215L93 230Z"' + common + '/>' +
        '<path d="M132 157Q161 135 193 155L177 163L192 174Q156 187 126 173Z" fill="' + p.glow + '"/>' +
        '<path d="M151 150L166 151L159 160Z" fill="' + p.ink + '"/>' +
        '<path d="M127 215Q150 229 176 213M119 187Q153 203 196 184" fill="none" stroke="' + p.glow + '" stroke-width="5" opacity=".75"/>' +
        '<path d="M113 160Q70 150 54 108Q94 111 127 136M190 142Q233 107 267 109Q250 153 207 166" fill="' + p.glow + '" opacity=".3" stroke="' + p.accent + '" stroke-width="3"/>' +
        '</g>';
    }
    if (/warrior|knight|sword|战士|戰士|骑士|騎士|剑|劍/.test(kind)) {
      return '<g>' +
        '<path d="M223 61L238 75L205 218L190 230L181 217L196 201Z" fill="url(#metal)" stroke="' + p.accent + '" stroke-width="3"/>' +
        '<path d="M177 206L216 224L209 237L170 219Z" fill="' + p.accent + '"/>' +
        '<path d="M126 113L137 82L159 68L184 83L193 116L179 140H141Z"' + common + '/>' +
        '<path d="M132 105L159 91L188 105L179 124H139Z" fill="' + p.ink + '"/>' +
        '<path d="M144 109H177" stroke="' + p.glow + '" stroke-width="5"/>' +
        '<path d="M119 139L143 128H178L202 143L218 211L191 222L185 278H130L124 221L95 208Z"' + common + '/>' +
        '<path d="M144 142L159 164L177 141L184 205L159 224L135 204Z" fill="' + p.glow + '" opacity=".35"/>' +
        '<path d="M112 151L76 169L83 223L117 214Z" fill="url(#metal)" stroke="' + p.accent + '" stroke-width="4"/>' +
        '<path d="M94 169L103 207M82 187L115 187" stroke="' + p.glow + '" stroke-width="4"/>' +
        '</g>';
    }
    if (/machine|mech|robot|cyber|机械|機械|机|機/.test(kind)) {
      return '<g>' +
        '<path d="M123 90L140 70H181L199 91L190 137H128Z"' + common + '/>' +
        '<path d="M137 99H185L178 121H132Z" fill="' + p.glow + '"/>' +
        '<path d="M148 107H174" stroke="' + p.ink + '" stroke-width="5"/>' +
        '<path d="M112 137H203L221 208L194 232H119L92 207Z"' + common + '/>' +
        '<path d="M91 144L61 158L48 220L79 228L108 184M207 144L239 156L265 211L235 226L207 184" fill="url(#metal)" stroke="' + p.accent + '" stroke-width="4"/>' +
        '<path d="M132 231L122 278H151L160 240L171 278H201L187 229Z" fill="' + p.ink + '" stroke="' + p.accent + '" stroke-width="3"/>' +
        '<circle cx="158" cy="179" r="30" fill="' + p.ink + '" stroke="' + p.glow + '" stroke-width="5"/>' +
        '<path d="M158 157L177 188H139Z" fill="' + p.accent + '"/>' +
        '<path d="M118 151H197M111 207H203" stroke="' + p.glow + '" stroke-width="4" opacity=".6"/>' +
        '</g>';
    }
    if (/beast|wolf|tiger|兽|獸|狼|虎/.test(kind)) {
      return '<g>' +
        '<path d="M80 233Q52 195 84 169Q52 136 77 98L118 126Q154 106 193 125L236 91Q254 137 222 166Q261 199 229 235L188 221L177 278H137L126 222Z" fill="' + p.ink + '" opacity=".7"/>' +
        '<path d="M99 157L78 111L124 135Q158 119 194 136L235 108L218 159Q235 193 207 217L189 249L176 278H134L122 242L102 216Q77 190 99 157Z"' + common + '/>' +
        '<path d="M108 160L137 151L128 170ZM183 151L211 160L191 170Z" fill="' + p.glow + '"/>' +
        '<path d="M130 183L159 170L188 184L176 211L159 221L141 209Z" fill="' + p.ink + '"/>' +
        '<path d="M149 185H170L159 198Z" fill="' + p.accent + '"/>' +
        '<path d="M111 196L75 203M112 207L77 224M205 195L242 201M204 207L239 224" stroke="' + p.accent + '" stroke-width="3"/>' +
        '</g>';
    }
    if (/fiend|demon|devil|恶魔|惡魔|魔/.test(kind)) {
      return '<g>' +
        '<path d="M115 133Q74 90 99 53Q104 94 143 104M179 104Q220 91 224 50Q251 91 203 137" fill="' + p.ink + '" stroke="' + p.accent + '" stroke-width="4"/>' +
        '<path d="M118 115L145 96H180L205 119L194 164L174 183H143L121 159Z"' + common + '/>' +
        '<path d="M130 132L150 126L143 142ZM173 126L192 132L179 143Z" fill="' + p.glow + '"/>' +
        '<path d="M130 174L99 144Q61 175 78 234L125 207L133 278H184L192 208L242 235Q253 174 216 145L187 176Z" fill="' + p.ink + '" stroke="' + p.accent + '" stroke-width="4"/>' +
        '<path d="M140 181L160 204L181 180L188 243L159 264L133 241Z" fill="url(#figure)"/>' +
        '<path d="M160 204V252M137 222H184" stroke="' + p.glow + '" stroke-width="4" opacity=".7"/>' +
        '</g>';
    }
    return '<g>' +
      '<circle cx="160" cy="164" r="101" fill="none" stroke="' + p.glow + '" stroke-width="3" opacity=".4"/>' +
      '<path d="M160 48L177 83L207 58L209 100L249 91L229 128L268 142L231 162L258 193L216 194L218 238L180 218L160 258L140 219L100 239L105 195L62 194L89 162L52 142L91 128L70 91L111 100L113 58L143 83Z" fill="' + p.glow + '" opacity=".18"/>' +
      '<path d="M129 111Q126 72 160 61Q195 73 191 112L181 139H139Z"' + common + '/>' +
      '<path d="M137 103L160 82L184 104L175 123H143Z" fill="' + p.ink + '"/>' +
      '<path d="M147 106H174" stroke="' + p.glow + '" stroke-width="5"/>' +
      '<path d="M126 132L96 157L75 231L116 213L126 278H195L204 213L245 232L224 157L192 132L160 161Z"' + common + '/>' +
      '<path d="M160 161L137 197L160 232L184 197Z" fill="' + p.glow + '" opacity=".55"/>' +
      '<path d="M104 156L66 128M216 156L254 128" stroke="' + p.accent + '" stroke-width="6"/>' +
      '<circle cx="61" cy="123" r="12" fill="' + p.glow + '"/><circle cx="259" cy="123" r="12" fill="' + p.glow + '"/>' +
      '</g>';
  }

  function spellShape(kind, p) {
    if (/heal|life|recovery|恢复|治|回复|回復/.test(kind)) {
      return '<g><path d="M160 267C119 226 65 188 65 130C65 65 139 58 160 111C181 58 255 65 255 130C255 188 201 226 160 267Z" fill="url(#figure)" stroke="' + p.accent + '" stroke-width="5"/><path d="M146 112H174V145H207V173H174V206H146V173H113V145H146Z" fill="' + p.glow + '" stroke="' + p.ink + '" stroke-width="3"/><path d="M94 94L72 70M226 94L248 70M160 75V43" stroke="' + p.accent + '" stroke-width="6" stroke-linecap="round"/></g>';
    }
    if (/sword|equip|blade|weapon|剑|劍|装备|裝備/.test(kind)) {
      return '<g transform="rotate(35 160 160)"><path d="M160 29L181 58L174 203L160 229L146 203L139 58Z" fill="url(#metal)" stroke="' + p.accent + '" stroke-width="4"/><path d="M160 53V193" stroke="' + p.glow + '" stroke-width="5"/><path d="M103 199L160 183L217 199L207 220L174 216V268H146V216L113 220Z" fill="' + p.ink + '" stroke="' + p.accent + '" stroke-width="4"/><circle cx="160" cy="247" r="10" fill="' + p.glow + '"/></g>';
    }
    if (/draw|book|scroll|knowledge|抽|书|書|卷/.test(kind)) {
      return '<g><path d="M54 91Q107 67 153 101V251Q104 219 54 240ZM266 91Q213 67 167 101V251Q216 219 266 240Z" fill="url(#figure)" stroke="' + p.accent + '" stroke-width="5"/><path d="M160 103V253M79 123Q111 112 134 128M79 153Q111 142 134 158M186 128Q211 112 241 123M186 158Q211 142 241 153" fill="none" stroke="' + p.glow + '" stroke-width="5"/><path d="M160 35L174 65L160 88L146 65Z" fill="' + p.glow + '"/></g>';
    }
    return '<g><circle cx="160" cy="158" r="104" fill="' + p.ink + '" opacity=".55" stroke="' + p.accent + '" stroke-width="4"/><circle cx="160" cy="158" r="78" fill="none" stroke="' + p.glow + '" stroke-width="4" stroke-dasharray="10 9"/><path d="M160 53L184 124L260 128L200 175L220 249L160 205L100 249L120 175L60 128L136 124Z" fill="url(#figure)" stroke="' + p.accent + '" stroke-width="4"/><circle cx="160" cy="157" r="35" fill="' + p.glow + '" opacity=".8"/><path d="M160 127L175 157L160 187L145 157Z" fill="' + p.ink + '"/></g>';
  }

  function trapShape(kind, p) {
    if (/mirror|reflect|镜|鏡|反射/.test(kind)) {
      return '<g><path d="M160 43L252 92V210L160 269L68 210V92Z" fill="url(#metal)" stroke="' + p.accent + '" stroke-width="6"/><path d="M160 68L229 107V196L160 239L91 196V107Z" fill="' + p.ink + '" stroke="' + p.glow + '" stroke-width="4"/><path d="M112 184L195 101M139 211L219 125M98 153L164 88" stroke="' + p.glow + '" stroke-width="9" opacity=".65"/><path d="M160 25V48M160 267V291M41 157H68M252 157H279" stroke="' + p.accent + '" stroke-width="6"/></g>';
    }
    if (/chain|bind|negate|锁|鎖|封|无效|無效/.test(kind)) {
      return '<g fill="none" stroke="' + p.accent + '" stroke-width="12"><ellipse cx="103" cy="108" rx="38" ry="57" transform="rotate(-38 103 108)"/><ellipse cx="158" cy="158" rx="38" ry="57" transform="rotate(-38 158 158)"/><ellipse cx="214" cy="208" rx="38" ry="57" transform="rotate(-38 214 208)"/></g><path d="M160 84L182 137L238 142L195 180L208 236L160 205L112 236L125 180L82 142L138 137Z" fill="url(#figure)" stroke="' + p.glow + '" stroke-width="4"/>';
    }
    return '<g><path d="M47 157Q160 42 273 157Q160 272 47 157Z" fill="url(#figure)" stroke="' + p.accent + '" stroke-width="5"/><circle cx="160" cy="157" r="63" fill="' + p.ink + '" stroke="' + p.glow + '" stroke-width="5"/><circle cx="160" cy="157" r="29" fill="' + p.glow + '"/><circle cx="160" cy="157" r="12" fill="' + p.ink + '"/><path d="M160 42V72M160 242V274M47 79L74 103M246 211L273 235M47 235L74 211M246 103L273 79" stroke="' + p.accent + '" stroke-width="6"/><path d="M99 267L86 291M132 273L127 302M188 273L193 302M221 267L234 291" stroke="' + p.glow + '" stroke-width="5"/></g>';
  }

  function card(cardData) {
    var data = cardData || {};
    var type = TYPES[data.type] ? data.type : 'monster';
    var p = TYPES[type];
    var attr = ATTRIBUTES[attribute(data.attribute)];
    var icon = key(data.icon || data.race || data.type);
    var seed = hash((data.id || '') + '|' + icon + '|' + type);
    var figure = type === 'monster' ? monsterShape(icon, p) : type === 'spell' ? spellShape(icon, p) : trapShape(icon, p);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320">' +
      '<defs>' +
      '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + attr[1] + '"/><stop offset=".48" stop-color="' + p.top + '"/><stop offset="1" stop-color="' + p.bottom + '"/></linearGradient>' +
      '<radialGradient id="aura"><stop stop-color="' + attr[0] + '" stop-opacity=".7"/><stop offset="1" stop-color="' + p.glow + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="figure" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + attr[0] + '"/><stop offset=".48" stop-color="' + attr[1] + '"/><stop offset="1" stop-color="' + p.ink + '"/></linearGradient>' +
      '<linearGradient id="metal" x1="0" y1="0" x2="1" y2="0"><stop stop-color="' + p.ink + '"/><stop offset=".45" stop-color="' + attr[0] + '"/><stop offset=".58" stop-color="#ffffff"/><stop offset="1" stop-color="' + attr[1] + '"/></linearGradient>' +
      '<pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="' + p.glow + '" stroke-width="1" opacity=".12"/></pattern>' +
      '</defs>' +
      '<rect x="3" y="3" width="314" height="314" rx="25" fill="url(#bg)"/>' +
      '<rect x="4" y="4" width="312" height="312" rx="24" fill="url(#grid)"/>' +
      '<circle cx="160" cy="145" r="145" fill="url(#aura)"/>' +
      '<path d="M18 91V31Q18 18 31 18H91M229 18H289Q302 18 302 31V91M302 229V289Q302 302 289 302H229M91 302H31Q18 302 18 289V229" fill="none" stroke="' + p.accent + '" stroke-width="5"/>' +
      '<path d="M160 15L172 28L160 41L148 28ZM160 279L172 292L160 305L148 292Z" fill="' + p.accent + '"/>' +
      '<path d="M35 213L160 288L285 213M35 232L160 307L285 232" fill="none" stroke="' + p.glow + '" stroke-width="2" opacity=".25"/>' +
      '<ellipse cx="160" cy="280" rx="105" ry="19" fill="' + p.ink + '" opacity=".65"/>' +
      stars(seed, attr[0]) + figure +
      '<rect x="5" y="5" width="310" height="310" rx="23" fill="none" stroke="' + attr[0] + '" stroke-width="2" opacity=".7"/>' +
      '</svg>';
    return uri(svg);
  }

  function avatar(who) {
    var rival = who === 1 || who === '1' || who === 'opponent' || who === 'ai';
    var p = rival ? {
      bg0: '#4c2478', bg1: '#0c0916', accent: '#c587ff', glow: '#f06fd6', skin: '#d8b2c9', shade: '#a7789c', hair: '#17111f', hairLight: '#513060', eye: '#e487ff', cloth: '#171321'
    } : {
      bg0: '#17679c', bg1: '#071729', accent: '#ffd66b', glow: '#72dfff', skin: '#f1c7a5', shade: '#c88d78', hair: '#15334f', hairLight: '#276b91', eye: '#65dfff', cloth: '#102c4b'
    };
    var hair = rival ?
      '<path d="M66 112Q50 47 110 35L98 12L137 28L165 7L169 33Q220 50 194 122L177 91L160 108L144 74L126 104L110 75L88 117Z" fill="' + p.hair + '" stroke="' + p.accent + '" stroke-width="3"/><path d="M91 65L119 42L112 70M146 43L166 28L162 65M179 54L196 72" fill="none" stroke="' + p.hairLight + '" stroke-width="8" stroke-linecap="round"/>' :
      '<path d="M67 112Q49 55 99 35L87 13L126 28L150 5L158 31L190 17L184 43Q216 71 192 119L174 85L151 105L139 69L113 102L101 73L84 119Z" fill="' + p.hair + '" stroke="' + p.accent + '" stroke-width="3"/><path d="M86 61L111 43L105 72M132 42L150 20L151 57M166 47L184 32" fill="none" stroke="' + p.hairLight + '" stroke-width="8" stroke-linecap="round"/>';
    var collar = rival ?
      '<path d="M69 246L79 180L108 165L128 195L150 165L181 180L193 246Z" fill="' + p.cloth + '" stroke="' + p.accent + '" stroke-width="4"/><path d="M79 181L50 153L57 218M181 181L210 151L204 219" fill="' + p.hair + '" stroke="' + p.accent + '" stroke-width="4"/><path d="M104 178L128 207L153 177L145 239H111Z" fill="' + p.accent + '" opacity=".32"/>' :
      '<path d="M55 246L73 183L107 164L128 190L151 164L185 183L203 246Z" fill="' + p.cloth + '" stroke="' + p.accent + '" stroke-width="4"/><path d="M74 181L99 176L128 208L158 176L184 182L166 218L128 236L91 217Z" fill="#e8f4ff" opacity=".9"/><path d="M109 190L128 209L148 190L141 239H116Z" fill="' + p.accent + '"/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">' +
      '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + p.bg0 + '"/><stop offset="1" stop-color="' + p.bg1 + '"/></linearGradient><linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + p.skin + '"/><stop offset="1" stop-color="' + p.shade + '"/></linearGradient></defs>' +
      '<rect width="256" height="256" rx="38" fill="url(#bg)"/>' +
      '<circle cx="128" cy="111" r="104" fill="none" stroke="' + p.glow + '" stroke-width="3" opacity=".3"/>' +
      '<path d="M128 7L143 24L128 41L113 24ZM18 128L35 113L52 128L35 143ZM204 128L221 113L238 128L221 143Z" fill="' + p.accent + '" opacity=".65"/>' +
      '<path d="M12 207L73 167M183 167L244 207M20 66L68 92M188 92L236 66" stroke="' + p.glow + '" stroke-width="3" opacity=".28"/>' +
      collar +
      '<path d="M106 144V178L128 195L151 177V141Z" fill="url(#skin)" stroke="' + p.bg1 + '" stroke-width="3"/>' +
      '<path d="M77 94Q77 52 128 47Q181 52 181 98V125Q174 163 128 174Q83 163 76 125Z" fill="url(#skin)" stroke="' + p.bg1 + '" stroke-width="3"/>' +
      '<path d="M77 107L65 102Q57 120 74 132M180 107L192 102Q200 120 182 132" fill="url(#skin)" stroke="' + p.bg1 + '" stroke-width="3"/>' +
      hair +
      '<path d="M91 116Q104 106 116 115M141 115Q154 106 167 116" fill="none" stroke="' + p.bg1 + '" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M94 122Q105 130 116 121Q105 115 94 122ZM141 121Q152 130 164 122Q152 115 141 121Z" fill="' + p.eye + '"/>' +
      '<path d="M128 123L122 141L132 143" fill="none" stroke="' + p.shade + '" stroke-width="3"/>' +
      (rival ? '<path d="M112 153Q128 148 145 153Q128 163 112 153Z" fill="' + p.bg1 + '"/>' : '<path d="M111 151Q128 163 146 150Q130 170 111 151Z" fill="#9f5f5f"/>') +
      '<path d="M88 143L76 149M169 143L181 149" stroke="' + p.accent + '" stroke-width="3" opacity=".65"/>' +
      '<path d="M128 215L139 226L128 241L117 226Z" fill="' + p.glow + '" stroke="' + p.accent + '" stroke-width="3"/>' +
      '<rect x="3" y="3" width="250" height="250" rx="36" fill="none" stroke="' + p.accent + '" stroke-width="4"/>' +
      '</svg>';
    return uri(svg);
  }

  var api = { card: card, avatar: avatar };
  root.DuelArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
