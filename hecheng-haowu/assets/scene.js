window.SCENE = {
  full: '<svg xmlns="http://www.w3.org/2000/svg" width="375" height="850" viewBox="0 0 750 1700" preserveAspectRatio="xMidYMid slice">' +
    '<defs>' +
    '<linearGradient id="g_scene_sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe9fb"/><stop offset="1" stop-color="#e9f8ff"/></linearGradient>' +
    '<linearGradient id="g_scene_grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd477"/><stop offset="1" stop-color="#79c361"/></linearGradient>' +
    '<clipPath id="g_scene_gclip"><path d="M -10 706 Q 90 698 190 705 Q 290 711 375 704 Q 465 697 560 705 Q 655 712 760 704 L 760 1710 L -10 1710 Z"/></clipPath>' +
    '<g id="g_scene_cloud" fill="#ffffff" opacity="0.85"><ellipse cx="0" cy="0" rx="48" ry="20"/><ellipse cx="-30" cy="-11" rx="26" ry="15"/><ellipse cx="10" cy="-17" rx="30" ry="17"/><ellipse cx="38" cy="-7" rx="24" ry="13"/></g>' +
    '<g id="g_scene_daisy">' +
    '<g fill="#ffffff">' +
    '<ellipse cx="0" cy="-6.5" rx="3.5" ry="6.2"/>' +
    '<ellipse cx="0" cy="-6.5" rx="3.5" ry="6.2" transform="rotate(72)"/>' +
    '<ellipse cx="0" cy="-6.5" rx="3.5" ry="6.2" transform="rotate(144)"/>' +
    '<ellipse cx="0" cy="-6.5" rx="3.5" ry="6.2" transform="rotate(216)"/>' +
    '<ellipse cx="0" cy="-6.5" rx="3.5" ry="6.2" transform="rotate(288)"/>' +
    '</g>' +
    '<circle r="3.8" fill="#f6c445"/>' +
    '<circle cx="-1.1" cy="-1.1" r="1.4" fill="#fbe08a"/>' +
    '</g>' +
    '<g id="g_scene_tuft" fill="#c6ecad">' +
    '<ellipse cx="0" cy="-6" rx="2" ry="7" transform="rotate(-24)"/>' +
    '<ellipse cx="0" cy="-7.5" rx="2" ry="8"/>' +
    '<ellipse cx="0" cy="-6" rx="2" ry="7" transform="rotate(24)"/>' +
    '</g>' +
    '</defs>' +
    '<rect x="-20" y="-20" width="790" height="730" fill="url(#g_scene_sky)"/>' +
    '<use href="#g_scene_cloud" transform="translate(165 112) scale(1.1)"/>' +
    '<use href="#g_scene_cloud" transform="translate(432 84) scale(0.88)"/>' +
    '<use href="#g_scene_cloud" transform="translate(612 182) scale(-1 1)"/>' +
    '<use href="#g_scene_cloud" transform="translate(282 232) scale(0.68)"/>' +
    '<path d="M -20 660 Q 160 348 360 660 L 770 660 L 770 700 L -20 700 Z" fill="#b5e39b"/>' +
    '<path d="M 300 664 Q 540 372 770 660 L 770 700 L 300 700 Z" fill="#b5e39b"/>' +
    '<path d="M -20 712 Q 200 425 470 712 L 770 712 L 770 730 L -20 730 Z" fill="#93d67d"/>' +
    '<path d="M 360 712 Q 610 462 770 712 L 770 730 L 360 730 Z" fill="#93d67d"/>' +
    '<g>' +
    '<path d="M 311 431 Q 330 424 349 431 L 369 588 Q 330 601 291 588 Z" fill="#f8f8f3"/>' +
    '<path d="M 330 427 L 349 431 L 369 588 Q 350 596 330 599 Z" fill="#dcdcd2"/>' +
    '<path d="M 321 595 L 321 571 Q 330 560 339 571 L 339 595 Z" fill="#b9c3c7"/>' +
    '<path d="M 302 435 L 358 435 L 336 378 Q 330 369 324 378 Z" fill="#aeb6bd"/>' +
    '<path d="M 330 371 Q 333.5 374 336 378 L 358 435 L 330 435 Z" fill="#9aa3ab"/>' +
    '<circle cx="330" cy="367" r="4.5" fill="#aeb6bd"/>' +
    '<g transform="translate(330 424)">' +
    '<g transform="rotate(45)"><rect x="-9" y="-84" width="18" height="82" rx="9" fill="#ffffff"/><rect x="-1.5" y="-78" width="3" height="74" fill="#d9dfe3"/><rect x="-7.5" y="-62" width="15" height="3" rx="1.5" fill="#d9dfe3"/><rect x="-7.5" y="-44" width="15" height="3" rx="1.5" fill="#d9dfe3"/><rect x="-7.5" y="-26" width="15" height="3" rx="1.5" fill="#d9dfe3"/></g>' +
    '<g transform="rotate(135)"><rect x="-9" y="-84" width="18" height="82" rx="9" fill="#ffffff"/><rect x="-1.5" y="-78" width="3" height="74" fill="#d9dfe3"/><rect x="-7.5" y="-62" width="15" height="3" rx="1.5" fill="#d9dfe3"/><rect x="-7.5" y="-44" width="15" height="3" rx="1.5" fill="#d9dfe3"/><rect x="-7.5" y="-26" width="15" height="3" rx="1.5" fill="#d9dfe3"/></g>' +
    '<g transform="rotate(225)"><rect x="-9" y="-84" width="18" height="82" rx="9" fill="#ffffff"/><rect x="-1.5" y="-78" width="3" height="74" fill="#d9dfe3"/><rect x="-7.5" y="-62" width="15" height="3" rx="1.5" fill="#d9dfe3"/><rect x="-7.5" y="-44" width="15" height="3" rx="1.5" fill="#d9dfe3"/><rect x="-7.5" y="-26" width="15" height="3" rx="1.5" fill="#d9dfe3"/></g>' +
    '<g transform="rotate(315)"><rect x="-9" y="-84" width="18" height="82" rx="9" fill="#ffffff"/><rect x="-1.5" y="-78" width="3" height="74" fill="#d9dfe3"/><rect x="-7.5" y="-62" width="15" height="3" rx="1.5" fill="#d9dfe3"/><rect x="-7.5" y="-44" width="15" height="3" rx="1.5" fill="#d9dfe3"/><rect x="-7.5" y="-26" width="15" height="3" rx="1.5" fill="#d9dfe3"/></g>' +
    '</g>' +
    '<circle cx="330" cy="424" r="10" fill="#aeb6bd"/>' +
    '<circle cx="330" cy="424" r="5" fill="#eef1f2"/>' +
    '</g>' +
    '<g>' +
    '<rect x="88" y="548" width="15" height="120" rx="7" fill="#9b6b43"/>' +
    '<g fill="#46a344"><circle cx="63" cy="492" r="38"/><circle cx="127" cy="492" r="38"/><circle cx="95" cy="452" r="46"/></g>' +
    '<g fill="#5cb853"><circle cx="72" cy="484" r="30"/><circle cx="118" cy="484" r="30"/><circle cx="95" cy="450" r="38"/></g>' +
    '</g>' +
    '<g>' +
    '<rect x="658" y="552" width="14" height="116" rx="7" fill="#9b6b43"/>' +
    '<g fill="#46a344"><circle cx="638" cy="500" r="34"/><circle cx="692" cy="500" r="34"/><circle cx="665" cy="464" r="42"/></g>' +
    '<g fill="#5cb853"><circle cx="646" cy="493" r="27"/><circle cx="684" cy="493" r="27"/><circle cx="665" cy="462" r="34"/></g>' +
    '</g>' +
    '<g>' +
    '<rect x="-10" y="661" width="770" height="11" rx="5.5" fill="#fbfbf4"/>' +
    '<rect x="-10" y="668" width="770" height="4" fill="#e6e6d8"/>' +
    '<rect x="-10" y="687" width="770" height="11" rx="5.5" fill="#fbfbf4"/>' +
    '<rect x="-10" y="694" width="770" height="4" fill="#e6e6d8"/>' +
    '<rect x="34" y="640" width="14" height="72" rx="7" fill="#fbfbf4"/><rect x="43" y="647" width="4.5" height="58" rx="2.25" fill="#e4e4d6"/>' +
    '<rect x="146" y="640" width="14" height="72" rx="7" fill="#fbfbf4"/><rect x="155" y="647" width="4.5" height="58" rx="2.25" fill="#e4e4d6"/>' +
    '<rect x="256" y="640" width="14" height="72" rx="7" fill="#fbfbf4"/><rect x="265" y="647" width="4.5" height="58" rx="2.25" fill="#e4e4d6"/>' +
    '<rect x="372" y="640" width="14" height="72" rx="7" fill="#fbfbf4"/><rect x="381" y="647" width="4.5" height="58" rx="2.25" fill="#e4e4d6"/>' +
    '<rect x="486" y="640" width="14" height="72" rx="7" fill="#fbfbf4"/><rect x="495" y="647" width="4.5" height="58" rx="2.25" fill="#e4e4d6"/>' +
    '<rect x="594" y="640" width="14" height="72" rx="7" fill="#fbfbf4"/><rect x="603" y="647" width="4.5" height="58" rx="2.25" fill="#e4e4d6"/>' +
    '<rect x="700" y="640" width="14" height="72" rx="7" fill="#fbfbf4"/><rect x="709" y="647" width="4.5" height="58" rx="2.25" fill="#e4e4d6"/>' +
    '</g>' +
    '<path d="M -10 706 Q 90 698 190 705 Q 290 711 375 704 Q 465 697 560 705 Q 655 712 760 704 L 760 1710 L -10 1710 Z" fill="url(#g_scene_grass)"/>' +
    '<g clip-path="url(#g_scene_gclip)">' +
    '<rect x="0" y="695" width="94" height="1015" fill="#ffffff" opacity="0.05"/>' +
    '<rect x="94" y="695" width="94" height="1015" fill="#3f8a34" opacity="0.06"/>' +
    '<rect x="188" y="695" width="94" height="1015" fill="#ffffff" opacity="0.05"/>' +
    '<rect x="282" y="695" width="94" height="1015" fill="#3f8a34" opacity="0.06"/>' +
    '<rect x="376" y="695" width="94" height="1015" fill="#ffffff" opacity="0.05"/>' +
    '<rect x="470" y="695" width="94" height="1015" fill="#3f8a34" opacity="0.06"/>' +
    '<rect x="564" y="695" width="94" height="1015" fill="#ffffff" opacity="0.05"/>' +
    '<rect x="658" y="695" width="94" height="1015" fill="#3f8a34" opacity="0.06"/>' +
    '<rect x="752" y="695" width="94" height="1015" fill="#ffffff" opacity="0.05"/>' +
    '</g>' +
    '<use href="#g_scene_daisy" transform="translate(70 1210) scale(0.9)"/>' +
    '<use href="#g_scene_daisy" transform="translate(200 1300)"/>' +
    '<use href="#g_scene_daisy" transform="translate(350 1230) scale(0.85)"/>' +
    '<use href="#g_scene_daisy" transform="translate(520 1290) scale(1.05)"/>' +
    '<use href="#g_scene_daisy" transform="translate(660 1195) scale(0.9)"/>' +
    '<use href="#g_scene_daisy" transform="translate(120 1420) scale(1.1)"/>' +
    '<use href="#g_scene_daisy" transform="translate(300 1490) scale(0.95)"/>' +
    '<use href="#g_scene_daisy" transform="translate(475 1560) scale(1.1)"/>' +
    '<use href="#g_scene_daisy" transform="translate(640 1480) scale(0.9)"/>' +
    '<use href="#g_scene_daisy" transform="translate(55 1600)"/>' +
    '<use href="#g_scene_daisy" transform="translate(230 1650) scale(1.05)"/>' +
    '<use href="#g_scene_daisy" transform="translate(420 1620) scale(0.9)"/>' +
    '<use href="#g_scene_daisy" transform="translate(600 1640) scale(1.15)"/>' +
    '<use href="#g_scene_daisy" transform="translate(715 1560) scale(0.85)"/>' +
    '<use href="#g_scene_tuft" transform="translate(40 1180)"/>' +
    '<use href="#g_scene_tuft" transform="translate(150 1250) scale(0.85)"/>' +
    '<use href="#g_scene_tuft" transform="translate(265 1195) scale(1.1)"/>' +
    '<use href="#g_scene_tuft" transform="translate(415 1265) scale(0.9)"/>' +
    '<use href="#g_scene_tuft" transform="translate(575 1215) scale(1.05)"/>' +
    '<use href="#g_scene_tuft" transform="translate(700 1300) scale(0.9)"/>' +
    '<use href="#g_scene_tuft" transform="translate(95 1360) scale(1.15)"/>' +
    '<use href="#g_scene_tuft" transform="translate(240 1395) scale(0.85)"/>' +
    '<use href="#g_scene_tuft" transform="translate(390 1420)"/>' +
    '<use href="#g_scene_tuft" transform="translate(545 1380) scale(1.1)"/>' +
    '<use href="#g_scene_tuft" transform="translate(680 1445) scale(0.9)"/>' +
    '<use href="#g_scene_tuft" transform="translate(35 1500)"/>' +
    '<use href="#g_scene_tuft" transform="translate(170 1540) scale(1.15)"/>' +
    '<use href="#g_scene_tuft" transform="translate(320 1565) scale(0.9)"/>' +
    '<use href="#g_scene_tuft" transform="translate(480 1500) scale(1.05)"/>' +
    '<use href="#g_scene_tuft" transform="translate(620 1570) scale(1.1)"/>' +
    '<use href="#g_scene_tuft" transform="translate(725 1470) scale(0.85)"/>' +
    '<use href="#g_scene_tuft" transform="translate(110 1665)"/>' +
    '<use href="#g_scene_tuft" transform="translate(290 1685) scale(0.9)"/>' +
    '<use href="#g_scene_tuft" transform="translate(520 1682) scale(1.15)"/>' +
    '</svg>'
};
