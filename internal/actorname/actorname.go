// Package actorname compares actor names across kanji forms and keeps the
// spellings a library merged under one name.
package actorname

import (
	"strings"
	"sync/atomic"
	"unicode"

	"github.com/ppxb/miyabi/internal/nfo"
)

// Japanese and traditional kanji common in actor names, mapped to simplified
// Chinese, so 三上悠亜, 三上悠亞 and 三上悠亚 share one folder.
var kanjiForms = strings.NewReplacer(
	"亜", "亚", "亞", "亚", "沢", "泽", "澤", "泽", "桜", "樱", "櫻", "樱", "恵", "惠", "涼", "凉", "広", "广",
	"廣", "广", "竜", "龙", "龍", "龙", "浜", "滨", "濱", "滨", "斉", "齐", "齊", "齐", "鈴", "铃", "優", "优",
	"愛", "爱", "結", "结", "華", "华", "紗", "纱", "絵", "绘", "麗", "丽", "実", "实", "實", "实", "楽", "乐",
	"樂", "乐", "葉", "叶", "陽", "阳", "夢", "梦", "誠", "诚", "斎", "斋", "齋", "斋", "戸", "户", "辺", "边",
	"邊", "边", "邉", "边", "嶋", "岛", "島", "岛", "瀬", "濑", "瀨", "濑", "間", "间", "長", "长", "東", "东",
	"橋", "桥", "関", "关", "關", "关", "円", "圆", "圓", "圆", "黒", "黑", "絢", "绚", "綾", "绫", "緒", "绪",
	"織", "织", "紀", "纪", "純", "纯", "靜", "静", "鳴", "鸣", "鳳", "凤", "涙", "泪", "淚", "泪", "蓮", "莲",
	"嵐", "岚", "響", "响", "歩", "步", "風", "风", "飛", "飞", "馬", "马", "鳥", "鸟", "國", "国", "會", "会",
	"様", "样", "樣", "样", "伝", "传", "傳", "传", "峯", "峰", "條", "条", "穂", "穗", "稲", "稻", "滝", "泷",
	"瀧", "泷", "栄", "荣", "榮", "荣", "藍", "蓝", "緑", "绿", "綠", "绿", "紅", "红", "絹", "绢", "凜", "凛",
	"団", "团", "團", "团", "読", "读", "讀", "读", "芸", "艺", "藝", "艺", "鉄", "铁", "鐵", "铁", "銀", "银",
	"鏡", "镜", "門", "门", "開", "开", "閑", "闲", "陰", "阴", "雲", "云", "電", "电", "顔", "颜", "願", "愿",
	"類", "类", "飯", "饭", "館", "馆", "髪", "发", "髮", "发", "魚", "鱼", "鮎", "鲇", "麥", "麦", "黃", "黄",
	"戀", "恋", "宮", "宫", "嶺", "岭", "巣", "巢", "帰", "归", "歸", "归", "彌", "弥", "徳", "德", "応", "应",
	"應", "应", "暁", "晓", "曉", "晓", "楓", "枫", "楊", "杨", "樹", "树", "檜", "桧", "櫛", "栉", "殘", "残",
	"気", "气", "氣", "气", "沖", "冲", "渉", "涉", "湊", "凑", "満", "满", "滿", "满", "潤", "润", "濃", "浓",
	"燈", "灯", "環", "环", "畫", "画", "禮", "礼", "穏", "稳", "穩", "稳", "範", "范", "築", "筑", "篠", "筱",
	"粋", "粹", "紋", "纹", "紘", "纮", "紬", "䌷", "細", "细", "絆", "绊", "統", "统", "継", "继", "繼", "继",
	"続", "续", "續", "续", "総", "总", "總", "总", "緋", "绯", "線", "线", "縁", "缘", "緣", "缘", "繭", "茧",
	"羅", "罗", "聖", "圣", "聡", "聪", "聰", "聪", "蒼", "苍", "蔵", "藏", "薫", "薰", "蘭", "兰", "蛍", "萤",
	"螢", "萤", "詩", "诗", "譽", "誉", "貴", "贵", "賀", "贺", "賢", "贤", "輝", "辉", "遙", "遥", "郷", "乡",
	"鄉", "乡", "鈺", "钰", "錦", "锦", "陸", "陆", "雛", "雏", "離", "离", "頼", "赖", "賴", "赖", "駒", "驹",
	"髙", "高", "鳩", "鸠", "鶴", "鹤", "瑤", "瑶", "絃", "弦", "綺", "绮", "綱", "纲", "緩", "缓", "縫", "缝",
	"蘇", "苏", "觀", "观", "観", "观", "親", "亲", "訪", "访", "認", "认", "諸", "诸", "議", "议", "讃", "赞",
	"豊", "丰", "豐", "丰", "賞", "赏", "購", "购", "車", "车", "軽", "轻", "輕", "轻", "遠", "远", "選", "选",
	"鄭", "郑", "醬", "酱", "醤", "酱", "針", "针", "鍋", "锅", "鐘", "钟", "閃", "闪", "陳", "陈", "険", "险",
	"險", "险", "隣", "邻", "鄰", "邻", "雑", "杂", "雜", "杂", "順", "顺", "須", "须", "頃", "顷", "頌", "颂",
	"頭", "头", "題", "题", "餌", "饵", "騎", "骑", "験", "验", "驗", "验", "鬱", "郁", "鮫", "鲛", "鯉", "鲤",
	"鴨", "鸭", "鶯", "莺", "鷲", "鹫", "龜", "龟", "亀", "龟",
)

// Key compares actor names regardless of kanji form, width and spacing.
func Key(name string) string {
	name = kanjiForms.Replace(strings.ToLower(name))
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) || r == '・' || r == '·' {
			return -1
		}
		if r >= '！' && r <= '～' {
			return r - 0xFEE0
		}
		return r
	}, name)
}

// Aliases maps the Key of every merged spelling to the name kept for it.
type Aliases map[string]string

// Canonical returns the kept name for a merged spelling, or name itself.
func (a Aliases) Canonical(name string) string {
	if kept, ok := a[Key(name)]; ok && kept != "" {
		return kept
	}
	return name
}

// Rename returns the actors with merged spellings replaced. The slice is
// copied only when a name changes.
func (a Aliases) Rename(actors []nfo.Actor) []nfo.Actor {
	var renamed []nfo.Actor
	for i, actor := range actors {
		name := a.Canonical(actor.Name)
		if name == actor.Name {
			continue
		}
		if renamed == nil {
			renamed = append([]nfo.Actor(nil), actors...)
		}
		renamed[i].Name = name
	}
	if renamed == nil {
		return actors
	}
	return renamed
}

var current atomic.Pointer[Aliases]

// Set replaces the aliases that exports apply to NFO actor names.
func Set(aliases Aliases) { current.Store(&aliases) }

// Current returns the aliases last set, or none.
func Current() Aliases {
	if aliases := current.Load(); aliases != nil {
		return *aliases
	}
	return nil
}
