

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
    featureFetchFields: ['ObjectID','FormattedID','Name','State', '_ProjectHierarchy','PercentDoneByStoryCount', 'PlannedStartDate','PlannedEndDate','ActualStartDate','ActualEndDate'],

    modelObject: undefined,
    riskMapping: [{
        name: 'R3',
        color: '#F66349',
        cls: 'r3'
    },{
        name: 'R2',
        color: '#FAD200',
        cls: 'r2'
    },{
        name: 'R1',
        color: '#8DC63F',
        cls: 'r1'
    },{
        name: 'Not Started',
        color: '#888',
        cls: 'notstarted'
    },{
        name: 'Done',
        color: '#3F86C9',
        cls: 'done'
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
        var model_name = this.modelType,
            field_names = this.featureFetchFields,
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

        var grid_ct = this.down('#display_box').add({
            xtype: 'container',
            flex: 1
        });

        var chart_ct = this.down('#display_box').add({
            xtype: 'container',
            flex: 2 // flex = 2 makes the chart container wider than the grid
        });

        this._buildChart(chart_ct, aggregate_data);
        this._buildGridView(grid_ct, aggregate_data);
    },
    _buildChart: function(chart_ct, aggregate_data){

       var colors = [];
        _.each(this.riskMapping, function(rm){
            colors.push(rm.color);
        });

        var chart = chart_ct.add({
            xtype: 'rallychart',
            itemId: 'rally-chart',
            loadMask: false,
            chartConfig: this._getChartConfig(),
            chartData: this._getChartData(aggregate_data),
            chartColors: colors
        });

    },
    _getChartData: function(aggregate_data){

        var categories = _.keys(aggregate_data),
            riskCategories = this.riskMapping,
            series = [];

        for (var j = 0; j < riskCategories.length; j++) {
            var series_obj = {
                name: riskCategories[j].name,
                data: [],
                color: riskCategories[j].color
            };
            for (var i = 0; i < categories.length; i++) {
                series_obj.data.push(aggregate_data[categories[i]][riskCategories[j].name].length);
            }
            series.push(series_obj);
        }
        console.log('categories', categories, 'series', series);
        return {
            categories: categories,
            series: series
        };
    },
    _getChartConfig: function(){
        var me = this;

        return {
            chart: {
                type: 'column'
            },
            title: {
                text: 'Features by Risk Category',
                align: 'left'
            },
            legend: {
                align: 'right',
                //x: -30,
                verticalAlign: 'top',
                //y: 25,
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
            yAxis: {
                title: {text: '# Features'}
            },
            xAxis: {
                title: {text: 'Projects'}
            },
            plotOptions: {

                column: {
                    stacking: 'normal',
                    dataLabels: {
                        enabled: true,
                        color: 'white',
                        formatter: function(){
                            if (this.y <= 0){
                                return '';
                            }
                            return this.y;
                        }
                    },
                    point: {
                        events: {
                            click: function(evt) {
                                me._onPointSelected(evt, me);
                            }
                        }
                    }
                }
            }
        };
    },
    _onPointSelected: function(evt, thisApp){
        var point = evt.currentTarget;
        console.log('click', evt, point, point.category, point.series.name, thisApp, thisApp._getRiskCategoryItemId(point.category, point.series.name));

        thisApp.down('#' + thisApp._getProjectItemId(point.category)).expand();
        thisApp.down('#' + thisApp._getRiskCategoryItemId(point.category, point.series.name)).expand();


    },
    _buildGridView: function(ct_grid, aggregate_data){
        console.log('_buildGridView', aggregate_data);

        var items = [];

        _.each(aggregate_data, function(obj, proj){
            var risk_items = [];
            _.each(obj, function(records, riskCategory){
                if (records.length > 0) {
                    var risk_store = Ext.create('Rally.data.custom.Store', {
                        pageSize: records.length,
                        data: records
                    });

                    risk_items.push({
                        title: '<div class="' + this._getRiskCategoryClass(riskCategory) + '">' + riskCategory + ' (' + records.length + ')<\/div>',
                        itemId: this._getRiskCategoryItemId(proj, riskCategory),
                        header: {
                            cls: this._getRiskCategoryClass(riskCategory)
                        },
                        defaults: {
                            bodyStyle: 'padding:5px'
                        },
                        items: [{
                            xtype: 'rallygrid',
                            store: risk_store,
                            columnCfgs: [{
                                dataIndex: 'FormattedID',
                                text: 'Formatted ID',
                                renderer: function(v,m,r){
                                    return Rally.nav.DetailLink.getLink({record: '/portfolioitem/feature/' + r.get('ObjectID'), text: v});
                                }
                            }, {
                                dataIndex: 'Name', text: 'Name', flex: 1
                            }],
                            showPagingToolbar: false,
                            showRowActionsColumn: false,
                            scroll: false
                        }]
                    });
                }
            }, this);

            var risk_pnl = Ext.create('Ext.panel.Panel',{
                title: '<div class="head">' + proj + '</div>',
                cls: 'x4-container-default x4-container fieldBucket',
                header: {
                    cls: 'x4-component x4-component-default head'
                },
                flex: 1,
                itemId: this._getProjectItemId(proj),
                defaults: {
                    bodyStyle: 'padding:5px'
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
            defaults: {
                // applied to each contained panel
                bodyStyle: 'padding:15px;border:0px'
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
        ct_grid.add(pnl);

    },
    _getRiskCategoryClass: function(riskCategory){
        var cls = '';
        _.each(this.riskMapping, function(rm){
            if (rm.name == riskCategory){
                cls = rm.cls;
            }
        });
        return cls;
    },
    _getRiskCategoryItemId: function(project, risk){
        return (project + '-' + risk).replace(/\s/g,'');
    },
    _getProjectItemId: function(project){
        return project.replace(/\s/g,'');
    },
    _aggregateData: function(records){
        var aggregate_data = {},
            risk_categories = [];

        console.log('child project hash', this.childProjectHash);

        _.each(this.riskMapping, function(obj){
            risk_categories.push(obj.name);
        });

        _.each(records, function(rec){
            var proj = this._getProjectCategory(rec),
                risk_category = this._getRiskCategory(rec, this.aggregateNumberField);

            if (!aggregate_data[proj]){
                aggregate_data[proj] = {};
                _.each(risk_categories, function(rc){
                    aggregate_data[proj][rc] = [];
                });
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
    _getRiskCategory: function(rec, riskField){
//#  Inputs:
//#    percentComplete (real)
//#    startDate (days since the epoch or date type where
//#      Tomorrow()-Today() = 1.0 (real))
//#    endDate (same type as startDate)
//#    asOfDate (same type as startDate) - Most often today. The naming of
//#      this variable supports the idea that you may want to look
//#      at the report as-of a certain date. All A2.0 reports will
//#      support printing any report as-of a certain timestamp.
//#    acceptanceStartDelay (real representing days) - delay before any
//#      any movement off of 0% complete is expected
//#    warningDelay (real representing days) - width of yellow
//#    inProgress (boolean)
//
//#  Colors:
//            #    Red - Late
//#    Green - On Track
//#    Yellow - At Risk
//#    White - Not Started
//#    Light Gray - Some Work Accepted Prior to Start Date
//#    Gray - Complete
//
//# Input parameters for Portfolio Items are calculated as below.
//# They could be different for Epics
//            asOfDay = <today>
//# percentDoneFieldName in the line below could be:
//            #   PercentDoneByStoryCount or PercentDoneByStoryPlanEstimate
//        percentComplete = 100 * PI[percentDoneFieldName]


        var startDate = new Date(),
            percentComplete = 100 * rec.get('PercentDoneByStoryCount');

        if (rec.get('ActualStartDate')) {
            startDate = Rally.util.DateTime.fromIsoString(rec.get('ActualStartDate'));
        }
        else if (rec.get('PlannedStartDate')) {
            startDate = Rally.util.DateTime.fromIsoString(rec.get('PlannedStartDate'));
        }

        var endDate = new Date();
        if (percentComplete == 100 && rec.get('ActualEndDate')) {
            endDate = Rally.util.DateTime.fromIsoString(rec.get('ActualEndDate'));
        } else {
            if (rec.get('PlannedEndDate')){
                endDate = Rally.util.DateTime.fromIsoString(rec.get('PlannedEndDate'));
            }
        }

        var deltaDays = Rally.util.DateTime.getDifference(endDate,startDate,'day'),
            acceptanceStartDelay = deltaDays * 0.2,
            warningDelay = deltaDays * 0.2,
            inProgress = percentComplete > 0;


        if (new Date() < startDate){
            return 'Not Started';
        }

        if (new Date() >= endDate){
            if (percentComplete >= 100){
                //return colors.gray;
                return 'Done';
            } else {
                return 'R3';
            }
        }

        var startDay = 0,
            asOfDay = Rally.util.DateTime.getDifference(new Date(), startDate, 'day'),
            endDay = deltaDays;


        var redXIntercept = startDay + acceptanceStartDelay + warningDelay,
            redSlope = 100.0 / (endDay - redXIntercept),
            redYIntercept = -1.0 * redXIntercept * redSlope,
            redThreshold = redSlope * asOfDay + redYIntercept;

        console.log('getRiskCategory red', rec.get('FormattedID'),percentComplete, redThreshold, startDate, endDate, percentComplete, redXIntercept, redSlope, redYIntercept, redThreshold);

        if (percentComplete < redThreshold){
            return 'R3';
        }

        var yellowXIntercept = startDay + acceptanceStartDelay,
            yellowSlope = 100 / (endDay - yellowXIntercept),
            yellowYIntercept = -1.0 * yellowXIntercept * yellowSlope,
            yellowThreshold = yellowSlope * asOfDay + yellowYIntercept;

        console.log('getRiskCategory yellow', rec.get('FormattedID'), percentComplete, yellowThreshold, startDate, endDate, yellowXIntercept, yellowSlope, yellowYIntercept);

        if (percentComplete < yellowThreshold){
            return 'R2';
        }
        return 'R1';
    }
});
