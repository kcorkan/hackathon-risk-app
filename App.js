Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'header_box'},
        {xtype:'container',itemId:'display_box', layout: {type: 'hbox'}}
    ],
    aggregateNumberField: 'ValueScore',
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

        this._fetchProjects().then({
            scope: this,
            success: function(projects){
                this.projectTree = this._getProjectTree(projects, this.getContext().getProject().ObjectID);
                this._addSelectorComponents();
            },
            failure: function(operation){
                Rally.ui.notify.Notifier.showError({message: 'Error getting Project Tree: ' + operation.error.errors.join(',')});
            }
        });


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
                   deferred.resolve(records);
               } else {
                   deferred.reject(operation);
               }
            }
        });
        return deferred;  
    },
    _fetchProjects: function(){
        var deferred = Ext.create('Deft.Deferred');
        
        var store = Ext.create('Rally.data.wsapi.Store',{
            model: 'Project',
            fetch: ['Name','Parent','ObjectID'],
            limit: Infinity,
            context: {
                project: this.getContext().getProject()._ref,
                projectScopeDown: true,
                projectScopeUp: false
            }
        });
        
        store.load({
            scope: this,
            callback: function(records, operation, success){
                if (success){
                    deferred.resolve(records);
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
                change: this._fetchData
            }
        });
    },
    _fetchData: function(cb){
        var model_name = 'PortfolioItem/Feature',
            field_names = ['FormattedID','Name','Project','State'].concat([this.aggregateNumberField]);
        this.setLoading(true);
        var filters = [{
            property: 'Release.Name',
            value: cb.getRecord().get('Name')
        }];

        var store = Ext.create('Rally.data.wsapi.Store',{
            model: model_name,
            fetch: field_names,
            filters: filters,
            limit: Infinity
        });
        
        store.load({
            scope: this,
            callback: function(records, operation, success){
                if (success){
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

        var aggregate_data = this._aggregateData(records, this.projectTree);

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

        var items = [];
        _.each(aggregate_data, function(obj, proj){
            var risk_items = [];
            _.each(obj, function(records, riskCategory){
                var html = 'No Data';
                if (records.length > 0){
                    var rec_array = _.map(records, function(r){return r.get('FormattedID') + ': ' + r.get('Name');});
                    console.log('rec_array', rec_array);

                    //var t = new Ext.Template('<tpl for="."><b>{[rec.get("FormattedID)]} : {Name}</b></tpl>');
                    //html = t.apply(records);
                    html = rec_array.join('<br/>');
                }

                risk_items.push({
                    title: riskCategory + ' (' + records.length + ')',
                    html: html
                });
            }, this);

            var risk_pnl = Ext.create('Ext.panel.Panel',{
                title: proj,
             //   width: 300,
             //   height: 300,
                defaults: {
                    // applied to each contained panel
                    bodyStyle: 'padding:15px'
                },
                layout: {
                    // layout-specific configs go here
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
    _aggregateData: function(records, projectTree){
        var aggregate_data = {};

        _.each(records, function(rec){
            var proj = this._getProjectCategory(rec, this.projectTree),
                risk_category = this._getRiskCategory(rec, this.aggregateNumberField);

            console.log('project', rec.get('Project').Name, proj, this.projectTree);
            if (!aggregate_data[proj]){
                aggregate_data[proj] = {'R1': [], 'R2': [], 'R3': []};
            }
            aggregate_data[proj][risk_category].push(rec);

        }, this);
        return aggregate_data;
    },
    _getProjectCategory: function(rec, projectTree){
        var project_name = rec.get('Project').Name,
            project_category = 'unknown';
        
        if (project_name == projectTree.get('Name')){
            return project_name;
        }  
        
        _.each(projectTree.get('Children'), function(child){
            if (this._isInProjectHierarchy(child, project_name)){
                project_category = child.get('Name');
            }
        }, this);
        console.log('cateory', project_category);
        return project_category;  
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
