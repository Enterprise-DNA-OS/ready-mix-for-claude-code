-- Fictional Kaipara Readymix: three plants, four trucks, four customers and seven
-- orders, dated relative to today so there is always something to chase. Idempotent:
-- running it twice changes nothing and never resets operational changes.

insert into plants(code,name,country,audit_ref,test_every_m3) values
 ('KAI','Kaipara plant','NZ','DEMO-AUDIT-KAI',75),
 ('WHG','Whangarei plant','NZ','DEMO-AUDIT-WHG',75),
 ('GLD','Gold Coast plant','AU',null,75)
on conflict (code) do nothing;

insert into mixes(code,description,grade_mpa,slump_mm,max_aggregate_mm,admixtures,price_per_m3) values
 ('N20-19-100','20 MPa footing mix',20,100,19,null,245),
 ('N25-19-100','25 MPa general mix',25,100,19,'water reducer',262),
 ('N32-13-120','32 MPa pump mix',32,120,13,'water reducer',298),
 ('S40-19-80','40 MPa structural mix',40,80,19,'water reducer, retarder',335)
on conflict (code) do nothing;

insert into customers(code,name,email,phone,credit_hold) values
 ('HARBOUR','Harbour Builders','orders@harbour-builders.example','09 400 1000',false),
 ('HARBOURCIV','Harbour Civil','site@harbour-civil.example','09 400 2000',false),
 ('RIDGE','Ridgeline Homes','accounts@ridgeline.example','09 400 3000',true),
 ('COAST','Coastal Pools','bookings@coastal-pools.example','07 5500 4000',false)
on conflict (code) do nothing;

insert into sites(code,customer_id,name,address)
select v.code,c.id,v.name,v.address from (values
 ('HB-MANGAWHAI','HARBOUR','Mangawhai townhouses','12 Molesworth Drive, Mangawhai'),
 ('HC-BRIDGE','HARBOURCIV','Kaiwaka stream bridge','State Highway 1, Kaiwaka'),
 ('RH-LOT14','RIDGE','Lot 14 Ruakaka','14 Marsden Point Road, Ruakaka'),
 ('CP-ONERAHI','COAST','Onerahi pool','8 Beach Road, Onerahi'),
 ('CP-BURLEIGH','COAST','Burleigh pool','22 Hill Avenue, Burleigh Heads')
) v(code,customer,name,address) join customers c on c.code=v.customer
on conflict (code) do nothing;

insert into trucks(code,rego,capacity_m3,active) values
 ('T01','KRM101',7.0,true),('T02','KRM102',7.0,true),('T03','KRM103',5.0,true),('T04','KRM104',6.0,false)
on conflict (code) do nothing;

insert into orders(code,customer_id,site_id,plant_id,mix_id,pour_date,start_time,volume_m3,element,pump,po_ref,status)
select v.code,c.id,s.id,p.id,m.id,current_date+v.days,v.start::time,v.m3,v.element,v.pump,v.po,v.status from (values
 ('RM100','HARBOURCIV','HC-BRIDGE','KAI','N25-19-100',-60,'07:00',70.0,'abutments',false,'HC-PO-881','complete'),
 ('RM104','HARBOURCIV','HC-BRIDGE','KAI','S40-19-80',-35,'06:30',63.0,'bridge deck',true,'HC-PO-902','complete'),
 ('RM107','HARBOUR','HB-MANGAWHAI','WHG','N25-19-100',-20,'07:00',140.0,'ground floor slabs',true,'HB-4410','complete'),
 ('RM105','HARBOUR','HB-MANGAWHAI','WHG','N25-19-100',-10,'07:30',21.0,'driveway',false,'HB-4432','complete'),
 ('RM103','COAST','CP-ONERAHI','KAI','N25-19-100',-1,'08:00',18.0,'pool shell',true,null,'confirmed'),
 ('RM101','HARBOUR','HB-MANGAWHAI','KAI','N32-13-120',1,'06:45',42.0,'first floor slab',true,'HB-4460','booked'),
 ('RM102','RIDGE','RH-LOT14','WHG','N20-19-100',2,'09:00',14.0,'footings',false,null,'confirmed'),
 ('RM106','COAST','CP-BURLEIGH','GLD','N25-19-100',3,'07:00',10.0,'pool shell',true,'CP-77','booked')
) v(code,customer,site,plant,mix,days,start,m3,element,pump,po,status)
join customers c on c.code=v.customer join sites s on s.code=v.site join plants p on p.code=v.plant join mixes m on m.code=v.mix
on conflict (code) do nothing;

-- Loads. Each order's dockets leave twenty minutes apart from its start time.
insert into dockets(docket_no,order_id,truck_id,batched_at,volume_m3,water_added_l,arrived_at,discharged_at,signed_by,returned_m3,invoice_ref)
select v.order_code||'-'||lpad(g::text,2,'0'), o.id, t.id,
       (o.pour_date + o.start_time) + (g-1)*interval '20 minutes',
       v.load_m3,
       case when v.order_code='RM104' and g=4 then 40 else 0 end,
       (o.pour_date + o.start_time) + (g-1)*interval '20 minutes' + interval '35 minutes',
       (o.pour_date + o.start_time) + (g-1)*interval '20 minutes' + case when v.order_code='RM105' and g=2 then interval '110 minutes' else interval '65 minutes' end,
       case when (v.order_code='RM104' and g=4) or (v.order_code='RM105' and g=3) then null else 'Site foreman' end,
       case when v.order_code='RM107' and g=20 then 1.5 else 0 end,
       case when v.order_code in ('RM104','RM107') or (v.order_code='RM100' and g<10) then 'INV-'||v.order_code else null end
from (values ('RM100',10,7.0),('RM104',9,7.0),('RM107',20,7.0),('RM105',3,7.0),('RM103',2,7.0)) v(order_code,loads,load_m3)
join orders o on o.code=v.order_code
cross join lateral generate_series(1,v.loads) g
join trucks t on t.code = case when g%2=1 then 'T01' else 'T02' end
on conflict (docket_no) do nothing;

insert into samples(code,docket_id,sampled_on,slump_mm,cylinders,lab_ref)
select v.code,d.id,d.batched_at::date,v.slump,3,v.lab from (values
 ('S100','RM100-03',95,'LAB-5501'),
 ('S104','RM104-01',85,'LAB-5530'),
 ('S105','RM104-05',90,'LAB-5531'),
 ('S108','RM105-01',100,'LAB-5577')
) v(code,docket,slump,lab) join dockets d on d.docket_no=v.docket
on conflict (code) do nothing;

insert into results(sample_id,age_days,tested_on,mpa,lab_ref)
select sa.id,v.age,sa.sampled_on+v.age,v.mpa,v.lab from (values
 ('S100',7,19.5,'LAB-5501-7'),('S100',28,29.0,'LAB-5501-28'),
 ('S104',7,31.5,'LAB-5530-7'),('S104',28,38.0,'LAB-5530-28'),
 ('S105',7,33.0,'LAB-5531-7')
) v(sample,age,mpa,lab) join samples sa on sa.code=v.sample
on conflict (sample_id,age_days) do nothing;
