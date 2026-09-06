# Bunood Letter Head — رأس وتذييل الطباعة

ترويسة طباعة ثنائية اللغة لكل مستندات الشركة (فواتير/عقود/عروض):

- **الرأس:** اسم الشركة **العربي يميناً** · **الشعار وسطاً** · **الإنجليزي يساراً** + شريطان (ذهبي فوق أخضر).
- **التذييل:** العنوان · الهاتف/البريد/الموقع · **سطر سياسة الخصوصية يظهر فقط إن وُجدت قيمة**.

الملفات:
- [`bunood_letterhead_header.html`](bunood_letterhead_header.html) — محتوى «Header HTML».
- [`bunood_letterhead_footer.html`](bunood_letterhead_footer.html) — محتوى «Footer HTML».

> الأنماط **مضمّنة (inline)** عمداً: في wkhtmltopdf يُعرَّض الرأس/التذييل معزولاً فلا يصله CSS
> الثيم ولا الـ Design Tokens. ألوان العلامة مكتوبة صراحةً (أخضر `#1F5145` / ذهبي `#C8923C` /
> رمادي `#5C6B66` …) وتُبقى متوافقة يدوياً مع [design-tokens.md](../../../bunood_erpnext/docs/design-tokens.md).

---

## التركيب (بيانات لكل موقع — ليست كوداً)

1. **الخطوط العربية على خادم الـ PDF** (ضروري — بدونها يظهر العربي مربعات فارغة):
   ثبّت **Cairo** و**Amiri**/**Tajawal** على الخادم ثم `fc-cache -f`.
   القوالب تتضمّن fallback شائعاً على لينكس (**Noto Naskh/Sans Arabic** — `fonts-noto-core`)
   كشبكة أمان، لكن ثبّت خط العلامة الأساسي لهوية متسقة.

2. **أنشئ Letter Head:** `Letter Head > New`
   - الاسم: `Bunood`
   - فعّل **Image/HTML = HTML**.
   - الصق محتوى `bunood_letterhead_header.html` في حقل **Header HTML**.
   - فعّل **Footer** والصق `bunood_letterhead_footer.html` في **Footer HTML**.
   - فعّل **Default Letter Head** (ليُطبَّق على كل المستندات).

3. **اضبط الشعار:** الرأس يقرأ `company_logo` من دوكتايب **Company**. ارفع شعار الشركة هناك.

4. **اربط الحقول بحسب موقعك** (القوالب فيها fallback + تعليقات؛ عدّل عند الحاجة):

   | المتغيّر | المصدر الافتراضي | ملاحظة |
   |---|---|---|
   | `name_ar` | `company_name_in_arabic` → `custom_company_name_ar` | الاسم العربي القانوني (غالباً حقل توطين ZATCA). **بلا fallback لاتيني عمداً** — إن لم يُملأ تبقى خانة اليمين فارغة بدل تكرار الاسم الإنجليزي مرتين |
   | `name_en` | `Company.company_name` | — |
   | `logo` | `company_logo` → `brand_logo` | من دوكتايب Company؛ يتقلّص لعرض خانته تلقائياً |
   | `address` | `custom_company_address` | **حقل مخصّص نصّي** (لا حقل عنوان جاهز على Company)؛ الأسطر المتعدّدة تُطبع أسطراً |
   | `phone/email/website` | `phone_no` / `email` / `website` | تُعزل `dir="ltr"` كي لا يقلب الـ bidi ‏`+966…` والروابط |
   | `privacy` | `custom_privacy_policy` → `custom_privacy_policy_url` | **أنشئ Custom Field** على Company إن أردت إظهاره؛ يختفي السطر إن كان فارغاً |

   > التذييل كله محروس: إن كانت كل الحقول فارغة لا يُطبع خط ولا شريط إطلاقاً.
   > كل القيم مهرَّبة (`| e`) ضد كسر الـ HTML/XSS في معاينة الطباعة.

5. **معاينة:** افتح أي فاتورة/عقد → Print → اختر Letter Head = Bunood.

---

## ملاحظات

- **اليمين/اليسار فيزيائي مقصود** (عُرف الترويسة ثنائية اللغة) — لا تُحوّله لخصائص منطقية.
- **بلا تدرّجات في الشريط** (شرائط صلبة) لأن wkhtmltopdf غير موثوق مع `linear-gradient`.
- إن استخدمت مولّد PDF الحديث (Chrome/WeasyPrint) فكل شيء يعمل أيضاً (الأنماط المضمّنة محايدة للمحرّك).
- **ZATCA QR** يُضاف في **Print Format** للفاتورة (طبقة أخرى)، لا في الترويسة — مرحلة لاحقة.
