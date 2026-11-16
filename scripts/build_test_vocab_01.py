#!/usr/bin/env python3
"""Build data/batches/sat-test-01.json from the Quizlet export of Practice Test 1 vocabulary.

Usage: python3 scripts/build_test_vocab_01.py <quizlet_export.txt>
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1])

# word -> (defn_zh, sentence_zh, [form for blank], [second sentence zh])
ZH = {
 "former": ("前任的；以前的", "這位教了三十年書的前任老師，在學校年度退休慶祝會上受到表揚。"),
 "astronaut": ("太空人", "這位曾在月球上漫步的太空人，如今四處演講，激勵學生投入科學與探索。"),
 "definite": ("明確的；確定的", "她對是否出席活動給了明確的答覆，非常清楚地確認了她的計畫與時間安排。"),
 "conjecture": ("推測；臆測", "他認為其他星球上存在生命的理論只是一種推測，目前尚無確切的科學證據。"),
 "demand": ("強烈要求", "工人們在工廠外的抗議中強烈要求更好的薪資與更安全的工作環境。", "demanded"),
 "speculate": ("推測；猜測", "科學家根據望遠鏡影像，推測遙遠行星上是否存在水。"),
 "doubt": ("懷疑", "根據影評人的負評，我懷疑這部電影會不會好看。"),
 "legislator": ("立法者；議員", "這位立法者提出一項新法案，以保護瀕危動物免於非法獵捕。"),
 "promote": ("促進；提倡", "該組織旨在透過學校計畫，在幼童之間提倡健康的飲食習慣。"),
 "vast": ("廣大的；巨大的", "探險家望向那片廣袤的沙漠，它向四面八方延伸，遠遠超出地平線。"),
 "impartial": ("公正的；不偏不倚的", "法官必須完全公正，平等對待雙方，不得偏袒任何一方。"),
 "offhand": ("隨口的；未經思考的", "他在會議中隨口說的一句話讓大家都很驚訝，而且似乎與主題無關。"),
 "persistent": ("堅持不懈的；持續的", "儘管起初失敗了好幾次，她堅持不懈的努力最終帶來了成功。"),
 "mandatory": ("強制的；義務的", "出於安全考量，在大多數國家騎機車戴安全帽是強制規定。"),
 "principle": ("原則；原理", "科學的一項重要原則是：主張必須經由證據與可重複的結果來驗證。"),
 "reservation": ("保留區（常指原住民保留地）", "研究團隊與當地保留區的領袖密切合作，以取得許可與意見。"),
 "collaboration": ("合作", "這項計畫是世界各地學生、教師與科學家合作的成果。"),
 "methodology": ("方法論；研究方法", "研究人員清楚說明了他們的研究方法，讓其他人能重複這項實驗。"),
 "assist": ("協助", "志工將在社區健康日協助年長者。"),
 "circumvent": ("規避；繞過", "他試圖利用技術性漏洞來規避學校的規定。"),
 "eclipse": ("使黯然失色；超越", "她的表現似乎讓比賽中其他所有人都黯然失色。"),
 "fabricate": ("捏造；編造", "這名學生試圖捏造缺考的藉口，但被抓到了。"),
 "exemplify": ("是……的典範；例證", "他的善良與誠實確實體現了一個好朋友應有的樣子。"),
 "parasitic": ("寄生的", "這種寄生植物附著在宿主的莖上，竊取其養分。"),
 "increase": ("增加", "規律運動可以增加你的活力並改善整體心情。"),
 "reproductive": ("生殖的；繁殖的", "青蛙的繁殖成功與否取決於牠所生活水域的潔淨程度。"),
 "absorb": ("吸收", "這塊海綿能在幾秒內輕易吸收大量的水。"),
 "protein": ("蛋白質", "肉類、蛋和豆類是身體所需蛋白質的良好來源。"),
 "synchronization": ("同步", "舞者們以完美的同步動作舞動，彷彿共享同一個節奏。"),
 "hibernation": ("冬眠", "熊靠進入冬眠並利用儲存的脂肪作為能量來度過冬天。"),
 "moderation": ("適度；節制", "適量吃甜食比每天都吃要健康。"),
 "binary": ("二元的；雙星的", "雙星系統由兩顆互相環繞的恆星組成。"),
 "formation": ("形成", "這位科學家研究遙遠星系中新行星的形成。"),
 "explanation": ("解釋；說明", "他清楚的解釋幫助全班理解了一個困難的概念。"),
 "modeling": ("建模；模擬", "電腦建模幫助科學家安全又快速地測試想法。", None, "科學家利用電腦建模來模擬這種疾病在不同天氣條件下，可能如何在大城市中擴散。"),
 "determine": ("確定；查明", "這位科學家致力於確定該藥物是否有效。", None, "團隊進行了多項實驗，以確定這些奇怪的症狀是由病毒、細菌還是環境因素引起。"),
 "discernible": ("可辨別的；明顯的", "分析了數百份問卷回覆後，仍未出現任何明顯可辨的趨勢能解釋顧客滿意度的下滑。"),
 "straightforward": ("簡單明瞭的", "老師為科學實驗給出了簡單明瞭的指示，確保即使經驗不多的學生也能跟上每一個步驟。"),
 "inconclusive": ("無定論的；不確定的", "檢驗結果沒有定論，這意味著醫生無法確定治療是否有效。"),
 "unbiased": ("無偏見的；公正的", "好的記者在報導新聞時必須保持公正，不帶個人意見地公平呈現故事的各方觀點。"),
 "tendency": ("傾向；趨勢", "他有開會遲到的強烈傾向，即使多次被提醒開始時間也一樣。"),
 "situate": ("使位於；設置", "他們選擇將新學校設在公園附近，希望學生能輕鬆接近綠色戶外空間。"),
 "rejection": ("拒絕", "等了好幾個月後，她收到了大學的拒絕信，雖然令人失望，但並非完全出乎意料。"),
 "revolves around": ("以……為中心；圍繞", "這部小說的情節圍繞著一個年輕女孩在歷史上危險時期尋找失蹤哥哥的旅程。"),
 "contemporary": ("當代的；現代的", "這座博物館展出當代藝術作品，這些作品經常運用現代科技，以及與當今政治文化議題相關的主題。"),
 "slang": ("俚語", "青少年常用讓成年人困惑的俚語，例如縮短單字或為熟悉的詞創造新含義。"),
 "repudiate": ("強烈否認；拒絕接受", "在一份公開聲明中，這位參議員強烈駁斥了激烈政治競選期間針對她的不實指控。", "repudiated"),
 "proclaim": ("宣告；宣布", "這位領袖站在歡呼的群眾面前，在多年的奮鬥與談判後，自豪地宣布了國家獨立。", "proclaimed"),
 "foretell": ("預言；預示", "她前一晚做的奇怪夢境，準確預示了第二天在學校發生的驚人事件。", "foretold"),
 "recant": ("撤回（聲明）；公開放棄", "在公眾壓力下，這位科學家撤回了他先前的主張，表示那是基於錯誤資訊與不良數據。", "recanted"),
 "distorted": ("扭曲的；失真的", "這名記者對事件的描述遭到扭曲，遺漏了關鍵事實，使情況看起來比實際更戲劇化。"),
 "recognize": ("認出；辨認", "我一開始沒認出她，因為她換了髮型，還戴著太陽眼鏡、穿著大外套。"),
 "automated": ("自動化的", "這座倉庫使用自動化系統，由機器人搬運箱子並放上貨架，完全不需要人工。"),
 "security test": ("安全驗證", "登入前，使用者必須通過安全驗證，證明自己是人類而非試圖入侵帳號的機器人。"),
 "bots": ("機器人程式", "許多網站遭到機器人程式攻擊，它們試圖猜測密碼，或在不被察覺的情況下向真實用戶發送垃圾訊息。"),
 "digitize": ("數位化", "博物館正致力於將整個館藏數位化，讓世界各地的人都能在線上欣賞這些藝術品。"),
 "judicial": ("司法的", "該國的司法系統負責解釋法律，並確保刑事與民事案件中的正義。"),
 "philosopher": ("哲學家", "這位古希臘哲學家教導人們關於生命的意義、人性與幸福。"),
 "rebut": ("反駁", "她試圖提出有力的事實與合乎邏輯的反論，來反駁文章中的說法。"),
 "objection": ("反對；異議", "律師在審判中提出異議，指出該問題不公平且具誤導性。"),
 "align with": ("與……一致", "新政策與公司在平等與公平方面的價值觀不一致。"),
 "campaign": ("運動；活動", "這項回收運動著重於透過海報與社群媒體，教育大眾認識塑膠污染。"),
 "reduction": ("減少；降低", "自從該市引進電動公車以來，空氣污染已大幅減少。"),
 "Epicurean": ("享樂主義者（的）；伊比鳩魯學派的", "他過著享樂主義的生活，總是追求美食、藝術與大自然中的寧靜時光。"),
 "virtue": ("美德", "誠實是大多數文化重視、並努力從小教導孩子的一種美德。"),
 "derive from": ("源自於", "許多英文單字源自拉丁字根，使它們在不同語言中具有相似的含義。"),
 "mislead": ("誤導", "這則廣告似乎誤導顧客，讓他們以為該產品是健康的，其實不然。"),
 "crystallographer": ("晶體學家", "這位晶體學家使用高倍顯微鏡，研究晶體如何在礦物與岩石內部形成。"),
 "portray": ("描繪；刻畫", "這部電影將把她刻畫成一位克服重重困難、堅強獨立的領袖。"),
 "heroine": ("女主角；女英雄", "故事的女主角冒著生命危險，在戰爭中拯救他人，展現了勇氣。"),
 "expand": ("擴大；擴展", "他們計畫擴大學校的藝術課程，讓更多學生能修習戲劇與音樂課。"),
 "skyrocket": ("飛漲；暴漲", "泡沫期間，稀有花卉的價格開始飛漲，達到原價的十倍。"),
 "asset": ("資產", "這家人的房子被視為他們最大的資產，因為它可以賣出高價。"),
 "investor": ("投資者", "這位投資者在公司於購買股票後不久倒閉時賠了錢。"),
 "magnetosensation": ("磁感應（能力）", "有些動物可能利用磁感應能力，沿著地球磁場進行長距離遷徙。"),
 "direction": ("方向", "這些鳥飛往與科學家對該季節預測相反的方向。"),
 "hemisphere": ("半球", "澳洲位於南半球，那裡的季節與歐洲相反。"),
 "barnacle": ("藤壺", "藤壺附著在船隻表面，經常損壞船漆並使船速變慢。"),
 "secretion": ("分泌物", "這種植物黏稠的分泌物幫助它捕捉並消化葉子上的昆蟲。"),
 "versatile": ("多用途的；多才多藝的", "塑膠是一種用途廣泛的材料，可用於包裝、建築與服裝。"),
 "nonrenewable": ("不可再生的", "石油是一種不可再生資源，如果過度使用終將耗盡。"),
 "biodegrade": ("生物分解", "與塑膠不同，紙張丟棄後很容易被生物分解。"),
 "stoma": ("氣孔", "葉子上的每個氣孔會開啟與關閉，以控制進入植物的空氣量。"),
 "pivotal": ("關鍵的；樞軸的", "他的發現在改變我們對植物生物學的理解上扮演了關鍵角色。"),
 "guard cell": ("保衛細胞", "每個保衛細胞控制著氣孔在白天是開啟還是關閉。"),
 "spatula": ("鏟狀構造；刮刀", "壁虎的腳上有微小的鏟狀構造，幫助牠們黏附在光滑的牆面上。", "spatulae"),
 "cling to": ("緊貼；黏附", "突如其來的暴雨過後，濕襯衫似乎緊貼著他的皮膚。"),
 "saturated": ("飽和的；濕透的", "海綿吸飽了水，再也裝不下更多液體。"),
 "flourish": ("繁榮；蓬勃發展", "她出版第一本成功的小說後，寫作生涯開始蓬勃發展。"),
 "distribute": ("分發；分配", "志工將把食物與物資分發給受暴風雨影響的家庭。"),
 "firm": ("公司；事務所", "她在一家專門處理國際合約的法律事務所工作。"),
 "coast": ("海岸", "我們沿著西岸多岩石的海岸觀賞日落。"),
 "slightly": ("稍微；略微", "這棟建築比旁邊那棟稍微高一點，但兩者樓層數相同。"),
 "surreal": ("超現實的；夢幻般的", "這位藝術家的畫作帶有超現實的特質，將真實的動物與不可能存在的發光景觀融合在一起。"),
 "hybrid": ("混合物；混合動力車", "這輛車是一款混合動力車，同時以電力與汽油驅動以節省燃料。"),
 "combination": ("組合；結合", "她的食譜是傳統風味與新食材的結合。"),
 "depict": ("描繪；描述", "這部電影將描繪主角的童年與邁向成功的歷程。"),
 "memoir": ("回憶錄", "她寫了一本回憶錄，描述她在戰爭期間擔任護士的經歷。"),
 "regiment": ("軍團", "他曾在一支參與過許多重要戰役、功勳卓著的軍團服役。"),
 "accomplishment": ("成就", "取得大學學位是她最自豪的成就，代表著多年的努力。"),
 "stroke": ("一筆；一劃", "藝術家大膽的一筆，讓整幅畫作活了起來。"),
 "mighty": ("強大的；巨大的", "英雄用他強大的力量舉起沉重的大門，解救了村民。"),
 "mirth": ("歡笑；歡樂", "喜劇演員在表演中一個接一個地講笑話，整個房間充滿了歡笑。"),
 "cradle": ("輕抱；呵護", "母親輕柔地抱著新生兒，慢慢搖著哄他入睡。", "cradled"),
 "brook": ("小溪", "他們坐在安靜的小溪旁，聆聽溪水流過石頭的輕柔聲響。"),
 "respond": ("回應；回答", "我叫他的名字時，他沒有立刻回應，但隨後微笑著轉過身來。"),
 "call": ("呼籲；召喚", "暴風雨損壞許多房屋後，社區回應了求助的呼籲。"),
 "perceptive": ("有洞察力的；敏銳的", "她非常敏銳，連人們情緒最細微的變化都能察覺。"),
 "elaborately": ("精心地；詳盡地", "他詳盡地解釋了食譜的每一個步驟，沒有任何不清楚的地方。"),
 "recount": ("敘述；講述", "這位老人喜歡在爐火旁向孫子們講述他年輕時的故事。"),
 "fond": ("喜愛的；深情的", "她對每年夏天去鄉下探望祖母有著非常美好的回憶。"),
 "observant": ("觀察力敏銳的", "這位偵探觀察力極為敏銳，能注意到混亂犯罪現場中其他人忽略的最小細節。"),
 "skeptical": ("懷疑的", "她對結果仍持懷疑態度，因為這項研究尚未經過同儕審查或重複驗證。"),
 "nuance": ("細微差別", "這幅畫捕捉了清晨天空中光線與色彩的每一絲細微變化。"),
 "vitality": ("活力", "舞者們充滿活力地舞動，觀眾的目光無法從舞台上移開。"),
 "migration": ("遷徙；移居", "鳥類遷徙的模式常隨著氣溫與棲地可得性的變化而改變。"),
 "artistic": ("藝術的；有藝術天分的", "她有一雙藝術家的眼睛，即使在最平凡的物品中也能看見美。"),
 "substantial": ("大量的；重要的", "研究人員發現，這種飲食與年長者記憶功能的改善之間有顯著的關聯。"),
 "imperceptible": ("難以察覺的", "溫度變化微小到難以察覺，大多數人甚至沒注意到它發生過。"),
 "toxicity": ("毒性", "科學家測量了這種化學物質的毒性，以判斷它對水生生物有多危險。"),
 "trait": ("特質；特徵", "好奇心是成功科學家與創新者身上常見的一種特質。"),
 "diaphragm": ("橫膈膜", "打嗝時，你的橫膈膜會突然收縮，使你不由自主地發出奇怪的聲音。"),
 "involuntarily": ("不由自主地", "當強光直接閃進他的眼睛時，他不由自主地眨了眼。"),
 "beneficially": ("有益地", "運動能透過減輕壓力與焦慮，對你的心理健康產生有益的影響。"),
 "contraction": ("收縮", "突然的肌肉收縮可能引起疼痛的抽筋，尤其是在寒冷天氣或高強度運動時。"),
 "prevail": ("獲勝；盛行", "儘管困難重重，她仍希望真相與正義最終能獲勝。"),
 "diverge": ("分歧；岔開", "這兩位朋友在踏上不同的職業道路後，興趣開始出現分歧。"),
 "intersect": ("相交；交叉", "這些道路在市中心交會，使那裡成為繁忙的交通樞紐。"),
 "interjected": ("插話；突然插入", "她在會議中插了一個笑話，以緩和嚴肅的氣氛。"),
 "prescribed": ("開（處方）；囑咐", "醫生囑咐休息和多喝水，以加速病情康復。"),
 "deceptive": ("欺騙性的；誤導的", "外表可能具有欺騙性——平靜的場景可能隱藏著潛在的危險或緊張。"),
 "innocuous": ("無害的", "這條蛇看起來很危險，但其實無害，對人類不構成威脅。"),
 "impractical": ("不切實際的", "飛行汽車聽起來令人興奮，但以目前的技術而言，日常使用並不切實際。"),
 "peripheral": ("周邊的；邊緣的", "這座城鎮位於帝國的邊陲地帶，遠離首都的影響。"),
 "approximate": ("大約的；近似的", "這項計畫的大約成本為一百萬美元，但最終支出可能有所不同。"),
 "tranquility": ("寧靜", "清晨湖面的寧靜，只偶爾被鳥鳴或樹葉沙沙聲打破。"),
 "germinate": ("發芽；萌生", "他成為作家的夢想，在高中時讀了一本震撼人心的小說後開始萌芽。"),
 "repose": ("休息；安眠", "長途健行後，健行者們在一棵大樹的樹蔭下找到了休息之處。"),
 "pilgrimage": ("朝聖；（有意義的）尋根之旅", "她踏上了前往祖母出生地的尋根之旅，想更了解家族的傳承。"),
 "unanimity": ("全體一致", "團隊以完全一致的意見做出了決定，沒有人反對。"),
 "crooned": ("低聲吟唱", "母親低聲哼唱搖籃曲，哄寶寶入睡。"),
 "stirring": ("激動人心的", "這場演講如此激動人心，觀眾起立鼓掌致意。"),
 "altruistically": ("無私地；利他地", "她無私地行動，將大部分的樂透獎金捐給了社區的慈善機構。"),
 "nondescript": ("毫無特色的", "這棟建築完全毫無特色，沒有獨特的建築風格或招牌。"),
 "participants": ("參與者", "這項實驗包含兩百名參與者，每人在不同的環境條件下接受測試。"),
 "postexperiment": ("實驗後的", "科學家在實驗後問卷中記錄所有反應，以衡量這段經歷的持久影響。"),
 "categorize": ("分類", "科學家常依據年代、物種與外形特徵將化石分類。"),
 "fragment": ("碎片", "每片陶器碎片都經過仔細刷淨並保存，以供日後分析。"),
 "archaeology": ("考古學", "他主修考古學，透過遺跡與文物探索古代文明。"),
 "concern": ("擔憂；關切", "大眾對資料隱私的擔憂已促使社群媒體政策做出改變。"),
 "unlikely": ("不太可能的", "兩位毫無關聯的作者碰巧寫出幾乎一模一樣的故事，是不太可能的。"),
 "veteran": ("老手；退伍軍人", "身為退伍軍人，他非常適合在結構嚴謹的政府部門工作。"),
 "bureaucracy": ("官僚體制", "她不喜歡申請政府許可證時所涉及的官僚程序。"),
 "familiarity": ("熟悉", "他對程式語言的熟悉使這門培訓課程很容易跟上。"),
 "pigment": ("色素", "花瓣中的紅色色素有助於吸引蜜蜂來授粉。"),
 "carotenoid": ("類胡蘿蔔素", "胡蘿蔔富含類胡蘿蔔素，有助於眼睛健康並呈現鮮豔的橙色。"),
 "manipulate": ("操控；巧妙處理", "她學會如何巧妙操控光線，以細膩地凸顯照片的主體。"),
 "microstructure": ("微觀結構", "在顯微鏡下，羽毛的微觀結構顯現出精細的圖案。"),
 "dishonesty": ("不誠實", "這位研究者捏造結果的不誠實行為，導致她失去了學術職位。"),
 "honor": ("表彰；給予榮譽", "委員會決定以終身成就獎表彰她的工作。"),
 "asteroid": ("小行星", "這顆小行星大到如果撞上地球，將會造成全球性的毀滅。"),
 "extinction": ("滅絕", "許多物種因棲地破壞與氣候變遷而面臨滅絕。"),
 "maintain": ("維持；保持", "跨國旅行時，很難維持規律的睡眠時間表。"),
}

# Sentences whose start the automatic splitter gets wrong (capitalised word inside the sentence).
SENTENCE_START = {
 "derive from": "Many English words",
 "hemisphere": "Australia is located",
 "philosopher": "The ancient Greek",
 "respond": "When I called",
}

WORD_FIX = {"speculate=conjucture": ("speculate", "= conjecture"), "call (noun)": ("call", "")}

def pos_key(pos):
    p = pos.lower()
    if p.startswith("n"): return "n."
    if p.startswith("adj"): return "adj."
    if p.startswith("adv"): return "adv."
    if p.startswith("v") or "phr" in p: return "v."
    return "other"

words = {}
order = []
for line in SRC.read_text(encoding="utf-8").splitlines():
    if not line.strip(): continue
    raw_word, rest = line.rstrip("\n").split("\t", 1)
    word, extra_note = WORD_FIX.get(raw_word, (raw_word, ""))
    m = re.match(r"\((.*?)\)\s*(.*)", rest, re.S)
    pos, body = m.group(1), m.group(2)
    # root note = parenthetical containing '=' or '+'
    root_note = extra_note
    rm = re.search(r"\(([^()]*[=+][^()]*)\)", body)
    if rm:
        root_note = (rm.group(1) + (" (" + extra_note + ")" if extra_note else "")).strip()
        body = body[:rm.start()] + body[rm.end():]
    body = re.sub(r"[一-鿿]+", "", body)  # stray Chinese inside English definition
    body = re.sub(r"\s+", " ", body).strip()
    start = SENTENCE_START.get(word)
    if start:
        idx = body.index(start)
    else:
        blank = body.index("______")
        idx = max(mm.start() for mm in re.finditer(r"(?:^|(?<=\s))[A-Z]", body[:blank]))
    defn = body[:idx].strip()
    sent = body[idx:].strip()
    zh = ZH[word]
    if word in words:  # duplicate entry in the export -> keep as a second example sentence
        if sent != words[word]["sentences"][0]["en"]:
            words[word]["sentences"].append({"en": sent, "zh": zh[3]})
        continue
    sentence = {"en": sent, "zh": zh[1]}
    if len(zh) > 2 and zh[2]: sentence["form"] = zh[2]
    order.append(word)
    words[word] = {
        "word": word, "pos": pos, "pos_key": pos_key(pos),
        "defn_en": defn, "defn_zh": zh[0], "root_note": root_note,
        "sentences": [sentence],
    }

items = [words[w] for w in order]
missing = [w for w in ZH if w not in words]
assert not missing, missing

fallback = json.loads((ROOT / "data/batches/p1-01-ab-abs.json").read_text(encoding="utf-8")).get("fallback_options", {})
batch = {
    "id": "sat-test-01", "part": "mocktest",
    "part_label": "Digital SAT Practice Test Vocabulary",
    "name": "Practice Test 1 · Vocabulary",
    "subtitle": "Words & options from Module 1 and Module 2",
    "count": len(items), "generated": True,
    "words": items, "family_options": {}, "fallback_options": fallback,
}
(ROOT / "data/batches/sat-test-01.json").write_text(json.dumps(batch, ensure_ascii=False, indent=1), encoding="utf-8")

index_path = ROOT / "data/mocktest-index.json"
index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {"batches": []}
entry = {"id": batch["id"], "part": "mocktest", "part_label": batch["part_label"], "name": "Practice Test 1",
         "subtitle": "Vocabulary from Module 1 & 2", "count": len(items), "generated": True,
         "search_terms": " ".join(order)}
index["batches"] = [b for b in index["batches"] if b["id"] != entry["id"]] + [entry]
index["batches"].sort(key=lambda b: b["id"])
index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
print(len(items), "words written")
for w in items:
    if not w["defn_en"] or "______" in w["defn_en"] or not w["sentences"][0]["en"].endswith("."):
        print("CHECK", w["word"], "|", w["defn_en"], "|", w["sentences"][0]["en"][:50])
