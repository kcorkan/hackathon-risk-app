Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'header_box'},
        {xtype:'container',itemId:'display_box', layout: {type: 'hbox'}}
    ],
    aggregateNumberField: 'ValueScore',
    modelType: 'PortfolioItem/Feature',
    modelObject: undefined,
    riskMapping: [{
        name: 'R1',
        color: '#FAD200',
        threshhold: 10
    },{
        name: 'R2',
        color: '#FF5400',
        threshhold: 20
    },{
        name: 'R3',
        color: '#F66349',
        threshhold: null
    }],

    launch: function() {
        var promises = [this._fetchModel(),this._fetchChildProjects()];
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(results){
                console.log('model', results);
                this.modelObject = results[0];
                this.childProjectHash = results[1];
                this._addSelectorComponents();
            },
            failure: function(operation){
                Rally.ui.notify.Notifier.showError('Error retrieving child projects: ' + operation.error.errors.join(','));
            }
        });

    },
    _fetchModel: function(){
        var deferred = Ext.create('Deft.Deferred');

        Rally.data.ModelFactory.getModel({
            type: this.modelType,
            success: function(model) {
                deferred.resolve(model);
            }
        });
        return deferred;
    },
    _fetchReleases: function(cb){
        var deferred = Ext.create('Deft.Deferred'),
        release_name = cb.getRecord().get('Name');
        
        var store = Ext.create('Rally.data.wsapi.Store',{
            model: 'Release',
            fetch: ['ObjectID','Name'],
            filters: [{
                property: 'Name',
                value: release_name 
            }]
        });
        
        store.load({
            scope: this,
            callback: function(records, operation, success){
               if (success) {
                   console.log('release records', records);
                   this._fetchData(records);
               } else {
                   Rally.ui.notify.Notifier.showError({message: 'Error getting Releases: ' + operation.error.errors.join(',')});

               }
            }
        });
        return deferred;  
    },
    _fetchChildProjects: function(){
        var deferred = Ext.create('Deft.Deferred');
        
        var store = Ext.create('Rally.data.wsapi.Store',{
            model: 'Project',
            fetch: ['Name','ObjectID'],
            filters: [{
                property: 'Parent.ObjectID',
                value: this.getContext().getProject().ObjectID
            }],
            limit: Infinity
        });
        
        store.load({
            scope: this,
            callback: function(records, operation, success){
                if (success){
                    var projectHash = {};
                    _.each(records, function(r){
                        projectHash[r.get('ObjectID')] = r.get('Name');
                    });

                    deferred.resolve(projectHash);
                } else {
                    deferred.reject(operation);
                }
            }
        });
        return deferred;  
    },
    _addSelectorComponents: function(){
        this.down('#header_box').add({
            xtype: 'rallyreleasecombobox',
            fieldLabel: 'Release',
            labelAlign: 'right',
            context: {
                project: this.getContext().getProject()._ref,
                projectScopeDown: this.getContext().getProjectScopeDown(),
                projectScopeUp: false
            },
            allowNoEntry: false,
            width: 300,
            listeners: {
                scope: this,
                change: this._fetchReleases
            }
        });
    },
    _fetchData: function(releases){
        var model_name = 'PortfolioItem/Feature',
            field_names = ['FormattedID','Name','State', '_ProjectHierarchy'].concat([this.aggregateNumberField]),
            release_oids = _.map(releases, function(rel){ return rel.get('ObjectID');});

        this.setLoading(true);

        var store = Ext.create('Rally.data.lookback.SnapshotStore',{
            fetch: field_names,
            find: {
                '_TypeHierarchy': model_name,
                '_ProjectHierarchy': this.getContext().getProject().ObjectID,
                'Release': {$in: release_oids},
                '__At': "current"
            }
        });

        store.load({
            scope: this,
            callback: function(records, operation, success){
                if (success){
                    console.log('records', records);
                    this._buildGridAndChart(records);
                    this.setLoading(false);
                } else {
                    this.setLoading(false);
                    Rally.ui.notify.Notifier.showError({message: 'Error fetching data: ' + operation.error.errors.join(',')});
                }
            }
        });
    },
    _buildGridAndChart: function(records){
        this.down('#display_box').removeAll();

        var aggregate_data = this._aggregateData(records);

        this._buildGridView(aggregate_data);

        this._buildChart(aggregate_data);
    },
    _buildChart: function(aggregate_data){

        var ct = this.down('#display_box').add({
            xtype: 'container',
            flex: 2
        });

        var chart = ct.add({
            xtype: 'rallychart',
            itemId: 'rally-chart',
            chartConfig: this._getChartConfig(),
            chartData: this._getChartData(aggregate_data)
        });

    },
    _getChartData: function(aggregate_data){

        var categories = _.keys(aggregate_data),
            riskCategories = [],
            series = [];

        _.each(this.riskMapping, function(riskMap){
            riskCategories.push(riskMap);
        });

        for (var j = 0; j < riskCategories.length; j++) {
            var series_obj = {name: riskCategories[j].name, data: [], color: riskCategories[j].color};
            for (var i = 0; i < categories.length; i++) {
                series_obj.data.push(aggregate_data[categories[i]][riskCategories[j].name].length);
            }
            series.push(series_obj);
        }
        console.log('categories', categories, 'sereis', series);
        return {
            categories: categories,
            series: series
        };
    },
    _getChartConfig: function(){
        return {
            chart: {
                type: 'column'
            },
            title: {
                text: 'Risk'
            },
            legend: {
                align: 'right',
                x: -30,
                verticalAlign: 'top',
                y: 25,
                floating: true,
                backgroundColor:  'white',
                borderColor: '#CCC',
                borderWidth: 1,
                shadow: false
            },
            tooltip: {
                formatter: function () {
                    return '<b>' + this.x + '</b><br/>' +
                        this.series.name + ': ' + this.y + '<br/>' +
                        'Total: ' + this.point.stackTotal;
                }
            },
            plotOptions: {
                column: {
                    stacking: 'normal',
                    dataLabels: {
                        enabled: true,
                        color: 'white',
                        style: {
                            textShadow: '0 0 3px black'
                        }
                    }
                }
            }
        };
    },
    _buildGridView: function(aggregate_data){
        console.log('_buildGridView', aggregate_data);

        var items = [],
            me = this,
            model = this.model;
        _.each(aggregate_data, function(obj, proj){
            var risk_items = [];
            _.each(obj, function(records, riskCategory){

                var risk_store = Ext.create('Rally.data.custom.Store',{
                    pageSize: records.length,
                    data: records
                });

                risk_items.push({
                    title: riskCategory + ' (' + records.length + ')',
                    items: [{
                        xtype: 'rallygrid',
                        store: risk_store,
                        columnCfgs: [{
                            dataIndex: 'FormattedID', text: 'Formatted ID'
                        },{
                            dataIndex: 'Name', text: 'Name', flex: 1
                        }],
                        showPagingToolbar: false,
                        showRowActionsColumn: false
                    }]
                });
            }, this);

            var risk_pnl = Ext.create('Ext.panel.Panel',{
                title: proj,
                flex: 1,
                defaults: {
                    bodyStyle: 'padding:15px'
                },
                layout: {
                    type: 'accordion',
                    titleCollapse: false,
                    animate: true
                },
                items: risk_items
            });
            items.push(risk_pnl);
        }, this);

        var pnl = Ext.create('Ext.panel.Panel', {
            flex: 1,
           // width: 300,
           // height: 300,
            defaults: {
                // applied to each contained panel
                bodyStyle: 'padding:15px'
            },
            layout: {
                // layout-specific configs go here
                type: 'accordion',
                titleCollapse: false,
                animate: true,
                activeOnTop: true
            },
            items: items
        });
        this.down('#display_box').add(pnl);

    },
    _magicRenderer: function(field,value,meta_data,record){
        var field_name = field.name || field.get('name');
      //  var model = this.model;
        // will fail fi field is not on the record
        // (e.g., we pick accepted date, by are also showing features
        try {
            var template = Rally.ui.renderer.RendererFactory.getRenderTemplate(model.getField(field_name)) || "";
            return template.apply(record.data);
        } catch(e) {
            return ".";
        }
    },
    _aggregateData: function(records){
        var aggregate_data = {};
        console.log('child project hash', this.childProjectHash);

        _.each(records, function(rec){
            var proj = this._getProjectCategory(rec),
                risk_category = this._getRiskCategory(rec, this.aggregateNumberField);

            console.log('project', rec.get('Project').Name, proj, this.projectTree);
            if (!aggregate_data[proj]){
                aggregate_data[proj] = {'R1': [], 'R2': [], 'R3': []};
            }
            aggregate_data[proj][risk_category].push(rec);

        }, this);
        return aggregate_data;
    },
    _getProjectCategory: function(rec){
        var project_hierarchy = rec.get('_ProjectHierarchy'),
            current_project_idx = _.indexOf(project_hierarchy, this.getContext().getProject().ObjectID);
            console.log('proj hierarchy', project_hierarchy, current_project_idx);
            if (current_project_idx < 0){
                return 'Unknown';
            }

            if (this.getContext().getProject().ObjectID == project_hierarchy.slice(-1)[0]){
                return this.getContext().getProject().Name;
            }

            //Project Hierarchy is like this:  [P0, P1, P2, P3] where P3 is the project that the item is in
            var project_category_oid = project_hierarchy[current_project_idx + 1];
            return this.childProjectHash[project_category_oid];
    },
    _isInProjectHierarchy: function(project, project_name){
        var isInProjectHierarchy = false; 
        console.log('_isprojecthierarchy', project.get('Name'), project_name);
        if (project.get('Name') == project_name){
            return true;  
        }
        
        _.each(project.get('Children'), function(child){
            if (this._isInProjectHierarchy(child, project_name)){
                isInProjectHierarchy = true; 
            }
        }, this);
        return isInProjectHierarchy;
    },
    _getRiskCategory: function(rec, riskField){
        var risk = rec.get(riskField) || 0;

        if (risk <= 10){
            return 'R1';
        }

        if (risk <= 20){
            return 'R2';
        }
        return 'R3';
    },
    _getProjectTree:function(records, currentProjectObjectID) {
        console.log('_getProjectTree', records);
        var projectHash = {};
        _.each(records, function(rec){
            projectHash[rec.get('ObjectID')] = rec;
            rec.set('Children',[]);

        });
        var current_root = null;


        var root_array = [];
        Ext.Object.each(projectHash, function(oid,item){
            console.log('project tree', oid, item.get('Name'), item, item.get('Parent'));
            if ( !item.get('Children') ) { item.set('Children',[]); }
            var direct_parent = item.get('Parent');
            if (!direct_parent && !Ext.Array.contains(root_array,item)) {
                root_array.push(item);
            } else {

                var parent_oid =  direct_parent.ObjectID || direct_parent.get('ObjectID');

                if (!projectHash[parent_oid]) {
                    if ( !Ext.Array.contains(root_array,item) ) {
                        root_array.push(item);
                    }
                } else {
                    var parent = projectHash[parent_oid];
                    if ( !parent.get('Children') ) { parent.set('Children',[]); }
                    var kids = parent.get('Children');
                    kids.push(item);
                    parent.set('Children',kids);
                }
            }
            if (item.get('ObjectID') == currentProjectObjectID){
                current_root = item;
            }
        },this);
        console.log('getProjectTree', current_root);
        return current_root;
    }
    
});
