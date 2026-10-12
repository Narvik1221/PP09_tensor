INSERT INTO pp09.categories(code,name) VALUES
 ('automation','Автоматизация'),('documents','Документооборот'),('logistics','Логистика')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pp09.clients(code,name,industry,city) VALUES
 ('alpha','Учебный завод «Альфа»','Машиностроение','Ярославль'),
 ('vector','Учебная компания «Вектор»','Логистика','Рыбинск'),
 ('dialog','Учебная компания «Диалог»','Услуги','Москва'),
 ('north','Учебный склад «Север»','Торговля','Кострома'),
 ('pulse','Учебный центр «Пульс»','Образование','Ярославль'),
 ('orbit','Учебная компания «Орбита»','Приборостроение','Вологда'),
 ('line','Учебная компания «Линия»','Транспорт','Иваново'),
 ('resource','Учебная компания «Ресурс»','Производство','Тверь')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pp09.tags(code,name) VALUES
 ('erp','ERP'),('crm','CRM'),('wms','WMS'),('edo','ЭДО'),
 ('analytics','Аналитика'),('integration','Интеграции'),('web','Веб-интерфейс'),('reports','Отчеты')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pp09.inquiry_statuses(code,name) VALUES
 ('new','Новое'),('in_progress','В работе'),('resolved','Решено'),('closed','Закрыто')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pp09.site_pages(path,title) VALUES
 ('/index.html','Главная'),('/projects.html','Проекты'),('/career.html','Карьера'),('/contact.html','Контакты')
ON CONFLICT(path) DO NOTHING;

WITH data(slug,title,summary,category,client,image) AS (VALUES
 ('erp-machine','ERP для машиностроения','Учет производства, планирование ресурсов и управленческие отчеты.','automation','alpha','dev-office'),
 ('document-flow','Электронный документооборот','Согласование документов и контроль исполнения задач.','documents','dialog','office-light'),
 ('wms-logistics','WMS для логистического центра','Учет остатков, приемки, отгрузки и размещения товаров.','logistics','vector','warehouse'),
 ('crm-sales','CRM отдела продаж','Обработка заявок, история контактов и контроль продаж.','automation','dialog','dev-office'),
 ('finance-reports','Финансовая аналитика','Плановые и фактические показатели на панели руководителя.','automation','resource','office-light'),
 ('production-plan','Планирование производства','Графики загрузки оборудования и производственных заказов.','automation','orbit','dev-office'),
 ('service-desk','Сервис обращений','Регистрация заявок и контроль сроков технической поддержки.','automation','pulse','team'),
 ('staff-accounting','Учет персонала','Расписания, учет рабочего времени и кадровые отчеты.','automation','line','office-light'),
 ('inventory-control','Учет оборудования','Карточки оборудования, перемещения и планирование ремонта.','automation','alpha','dev-office'),
 ('learning-portal','Учебный портал','Курсы, задания и результаты подготовки сотрудников.','automation','pulse','team'),
 ('contract-approval','Согласование договоров','Маршруты согласования договоров и контроль версий.','documents','orbit','office-light'),
 ('invoice-register','Реестр счетов','Регистрация счетов и сопоставление с договорами.','documents','resource','office-light'),
 ('hr-documents','Кадровые документы','Учет кадровых приказов и ознакомления сотрудников.','documents','alpha','team'),
 ('archive-search','Электронный архив','Поиск документов по реквизитам и ограничение доступа.','documents','dialog','office-light'),
 ('task-approval','Контроль поручений','Регистрация поручений и уведомления об исполнении.','documents','pulse','dev-office'),
 ('incoming-mail','Входящая корреспонденция','Регистрация писем и назначение ответственных.','documents','north','office-light'),
 ('quality-records','Документы качества','Протоколы проверок и история изменений документации.','documents','orbit','dev-office'),
 ('supply-documents','Документы поставок','Сопоставление накладных с фактическими поставками.','logistics','vector','warehouse'),
 ('warehouse-address','Адресное хранение','Ячейки склада и маршруты размещения товара.','logistics','north','warehouse'),
 ('delivery-routes','Планирование доставки','Маршруты доставки и загрузка транспорта.','logistics','line','warehouse'),
 ('stock-audit','Инвентаризация','Проверка остатков и учет расхождений на складе.','logistics','north','warehouse'),
 ('shipment-control','Контроль отгрузки','Подготовка заказов и контроль передачи перевозчику.','logistics','vector','warehouse'),
 ('transport-board','Диспетчеризация','Распределение транспортных заданий и учет рейсов.','logistics','line','warehouse'),
 ('supply-planning','Планирование снабжения','Сопоставление потребностей и графиков поставок.','logistics','resource','warehouse')
)
INSERT INTO pp09.projects(slug,title,summary,category_id,client_id,image_url)
SELECT d.slug,d.title,d.summary,c.id,cl.id,'/assets/img/'||d.image||'.webp'
FROM data d JOIN pp09.categories c ON c.code=d.category JOIN pp09.clients cl ON cl.code=d.client
ON CONFLICT(slug) DO NOTHING;

INSERT INTO pp09.project_tags(project_id,tag_id)
SELECT p.id,t.id FROM pp09.projects p JOIN pp09.categories c ON c.id=p.category_id
JOIN pp09.tags t ON t.code=CASE WHEN p.slug IN ('crm-sales','service-desk') THEN 'crm' WHEN p.slug='finance-reports' THEN 'analytics' WHEN c.code='automation' THEN 'erp' WHEN c.code='documents' THEN 'edo' ELSE 'wms' END
WHERE p.slug IN ('erp-machine','document-flow','wms-logistics','crm-sales','finance-reports','production-plan','service-desk','staff-accounting','inventory-control','learning-portal','contract-approval','invoice-register','hr-documents','archive-search','task-approval','incoming-mail','quality-records','supply-documents','warehouse-address','delivery-routes','stock-audit','shipment-control','transport-board','supply-planning')
ON CONFLICT DO NOTHING;
INSERT INTO pp09.project_tags(project_id,tag_id)
SELECT p.id,t.id FROM pp09.projects p JOIN pp09.tags t ON t.code=CASE WHEN p.slug IN ('finance-reports','staff-accounting','quality-records') THEN 'reports' WHEN p.slug IN ('erp-machine','document-flow','wms-logistics','supply-documents') THEN 'integration' WHEN p.slug IN ('production-plan','supply-planning') THEN 'analytics' ELSE 'web' END
WHERE p.slug IN ('erp-machine','document-flow','wms-logistics','crm-sales','finance-reports','production-plan','service-desk','staff-accounting','inventory-control','learning-portal','contract-approval','invoice-register','hr-documents','archive-search','task-approval','incoming-mail','quality-records','supply-documents','warehouse-address','delivery-routes','stock-audit','shipment-control','transport-board','supply-planning')
ON CONFLICT DO NOTHING;

WITH project_order AS (SELECT id,row_number() OVER(ORDER BY slug) n FROM pp09.projects),
status_order AS (SELECT id,row_number() OVER(ORDER BY code) n FROM pp09.inquiry_statuses)
INSERT INTO pp09.inquiries(project_id,status_id,name,email,topic,channel,message,is_demo,demo_code,created_at)
SELECT p.id,s.id,'Учебный посетитель '||g.n,'student'||g.n||'@example.test',
 CASE WHEN g.n%3=0 THEN 'career' WHEN g.n%3=1 THEN 'project' ELSE 'support' END,
 'email','Демонстрационное обращение '||g.n||': требуется информация о проекте и условиях сопровождения.',
 TRUE,'seed-inquiry-'||g.n, DATE '2026-09-20'+(g.n%7)*INTERVAL '1 day'
FROM generate_series(1,40) g(n)
JOIN project_order p ON p.n=(g.n-1)%24+1
JOIN status_order s ON s.n=(g.n-1)%4+1
ON CONFLICT(demo_code) DO NOTHING;

INSERT INTO pp09.daily_views(visited_on,page_id,views,is_demo)
SELECT DATE '2026-09-20'+g.n,p.id,10+g.n*3+p.id,TRUE
FROM generate_series(0,6) g(n) CROSS JOIN pp09.site_pages p
ON CONFLICT(visited_on,page_id) DO NOTHING;
