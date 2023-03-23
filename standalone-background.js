if (!CRUD) var CRUD = {
    RELATION_SINGLE: 1,
    RELATION_FOREIGN: 2,
    RELATION_MANY: 3,
    RELATION_CUSTOM: 4,
    DEBUG: false,
    __log: {
        writesQueued: 0,
        writesExecuted: 0
    },
    __statsListeners: [],
    stats: {},
    addStatsListener: function(listener) {
        CRUD.__statsListeners.push(listener);
    },
    log: function() {
        if (CRUD.DEBUG) {
            console.log.apply(console, arguments);
        }
    }
};

/** 
 * Turn CRUD.stats into a proxy object with dynamic getters and setters (pipes to _log)
 * This way, we can fire events async
 */
Object.defineProperty(CRUD.stats, 'writesQueued', {
    get: function() {
        return CRUD.__log.writesQueued;
    },
    set: function(newValue) {
        CRUD.__log.writesQueued = newValue;
        CRUD.__statsListeners.map(function(listener) {
            listener(CRUD.__log);
        });
    }
});
Object.defineProperty(CRUD.stats, 'writesExecuted', {
    get: function() {
        return CRUD.__log.writesExecuted;
    },
    set: function(newValue) {
        CRUD.__log.writesExecuted = newValue;
        CRUD.__statsListeners.map(function(listener) {
            listener(CRUD.__log);
        });
    }
});





/** 
 * The main object proxy that returns either a fresh entity object or a promise that loads data, when you pass the primary key value to search for.
 *
 * The main idea behind this is that you can do:
 * var Project = CRUD.define(dbSetup, methods)
 * var p = new Project(); // now you can use get/set on p, after which you can use p.Persist().then(function() {} );
 * new Project(20).then(function(project) { project with id 20 has been fetched from adapter, use it here. })
 */


CRUD.EntityManager = (function() {

    this.entities = {};
    this.constructors = {};
    this.cache = {};
    this.connectionAdapter = false;

    this.defaultSetup = {
        className: 'CRUD.Entity',
        ID: false,
        table: false,
        primary: false,
        fields: [],
        indexes: [],
        autoSerialize: [],
        defaultValues: {},
        adapter: false,
        orderProperty: false,
        orderDirection: false,
        relations: {},
        connectors: {},
        createStatement: false,
        keys: []
    };

    var ucFirst = function(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    };

    /**
     * Register a new entity into the entity manager, which will manage it's properties, relations, and data.
     */
    this.registerEntity = function(namedFunction, dbSetup, methods) {

        namedFunction.prototype = Object.create(CRUD.Entity.prototype);
        namedFunction.prototype.constructor = CRUD.Entity;

        dbSetup.fields.map(function(field) {
            Object.defineProperty(namedFunction.prototype, field, {
                get: ((field in methods) && 'get' in methods[field]) ? methods[field].get : function() {
                    return this.get(field);
                },
                set: ((field in methods) && 'set' in methods[field]) ? methods[field].set : function(newValue) {
                    this.set(field, newValue);
                },
                enumerable: false,
                configurable: true
            });
        }, namedFunction);

        for (var j in methods) {
            if (dbSetup.fields.indexOf(j) == -1) {
                namedFunction.prototype[j] = methods[j];
            }
        }
        var className = dbSetup.className;
        Object.defineProperty(namedFunction.prototype, '__className__', {
            get: function() {
                return className;
            },
            enumerable: false,
            configurable: true
        });

        CRUD.log("Register entity", namedFunction, dbSetup, className);
        if (!(className in this.entities)) {
            this.entities[className] = Object.clone(this.defaultSetup);
        }
        for (var prop in dbSetup) {
            this.entities[className][prop] = dbSetup[prop];
        }

        this.constructors[className] = function(ID) {
            var instance = new namedFunction();

            if (ID) {
                instance.primaryKeyInit(ID);
            }
            return instance;
        };

        namedFunction.findByID = function(id) {
            var filters = {};
            filters[dbSetup.primary] = id;
            return CRUD.FindOne(className, filters);
        };

        namedFunction.Find = function(filters, options) {
            return CRUD.Find(className, filters, options);
        };

        namedFunction.FindOne = function(filters, options) {
            return CRUD.FindOne(className, filters, options);
        };

        dbSetup.fields.map(function(field) {
            namedFunction['findOneBy' + ucFirst(field)] = function(value, options) {
                var filter = {};
                filter[field] = value;
                return CRUD.FindOne(className, filter, options || {});
            };
            namedFunction['findBy' + ucFirst(field)] = function(value, options) {
                var filter = {};
                filter[field] = value;
                return CRUD.Find(className, filter, options || {});
            };
        });

        Object.keys(dbSetup.relations).map(function(name) {
            CRUD.log("creating relation search for ", name, " to ", className);
            namedFunction['findBy' + name] = function(filter, options) {
                var filters = {};
                filters[name] = filter;
                return CRUD.Find(className, filters, options || {});
            };
            namedFunction['findOneBy' + name] = function(filter, options) {
                var filters = {};
                filters[name] = filter;
                return CRUD.FindOne(className, filters, options || {});
            };
        });

        return namedFunction;
    };

    this.getPrimary = function(className) {
        if (!className || !this.entities[className]) {
            throw "Invalid className passed to CRUD.EntityManager.getPrimary : " + className;
        }
        return this.entities[className].primary;
    };

    this.getDefaultValues = function(className) {
        if (!className || !this.entities[className]) {
            throw "Invalid className passed to CRUD.EntityManager.getDefaultValues : " + className;
        }
        return this.entities[className].defaultValues;
    };

    /** 
     * Set and initialize the connection adapter.
     */
    this.setAdapter = function(adapter) {
        this.connectionAdapter = adapter;
        return this.connectionAdapter.Init();
    };

    this.getAdapter = function() {
        return this.connectionAdapter;
    };

    this.getFields = function(className) {
        return this.entities[className].fields;
    };
    this.hasRelation = function(className, related) {
        return ((related in this.entities[className].relations));
    };

    return this;

}());

CRUD.define = function(namedFunction, properties, methods) {
    return CRUD.EntityManager.registerEntity(namedFunction, properties, methods);

};

CRUD.setAdapter = function(adapter) {
    return CRUD.EntityManager.setAdapter(adapter);
};


/**
 * CRUD.Find is probably the function that you'll use most to query things:
 *
 * Syntax:
 * CRUD.Find(Product, { Catalog: { ID: 1 }} ).then( function(products) {
 *		for(var i=0; i< products.length; i++) {
 *			$$(".body")[0].adopt(products[i].display());
 *		}
 *	}, function(error) { CRUD.log("ERROR IN CRUD.FIND for catalog 1 ", error); });
 */
CRUD.Find = function(obj, filters, options) {
    var type = null;

    if (obj instanceof CRUD.Entity || obj.prototype instanceof CRUD.Entity) {
        type = obj.getType();

        if (obj.getID() !== false) {
            CRUD.log("Object has an ID! ", ID, type);
            filters.ID = obj.getID();
            filters.type = filters;
        }
    } else if ((obj in CRUD.EntityManager.entities)) {
        type = obj;
    } else {
        throw "CRUD.Find cannot search for non-CRUD objects like " + obj + "!";
    }

    return CRUD.EntityManager.getAdapter().Find(type, filters, options).then(function(results) {
        return results.map(function(el) {
            if (!(type in CRUD.EntityManager.cache)) {
                CRUD.EntityManager.cache[type] = {};
            }
            var idProp = CRUD.EntityManager.entities[type].primary;
            if (!(el[idProp] in CRUD.EntityManager.cache[type])) {
                CRUD.EntityManager.cache[type][el[idProp]] = new CRUD.EntityManager.constructors[type]();
            }
            return CRUD.EntityManager.cache[type][el[idProp]].importValues(el);
        });
    });
};

/** 
 * Uses CRUD.find with a limit 0,1 and returns the first result.
 * @returns Promise
 */
CRUD.FindOne = function(obj, filters, options) {
    options = options || {};
    options.limit = 1;
    return this.Find(obj, filters, options).then(function(result) {
        return result[0];
    });
};


CRUD.fromCache = function(obj, values) {
    try {
        obj = (typeof obj == 'function') ? new obj() : new CRUD.EntityManager.constructors[obj]();
        type = (obj instanceof CRUD.Entity) ? obj.getType() : false;
    } catch (E) {
        CRUD.log("CRUD.fromCache cannot create for non-CRUD objects like " + obj + "! \n" + E);
        return false;
    }
    obj.importValues(values, true);
    return obj;
};

/**
 * Default interface for a connection.
 * Implement these methods for a new adapter.
 */
CRUD.ConnectionAdapter = function(endpoint, options) {
    this.endpoint = endpoint || false;
    this.options = options || {};

    this.Init = function() {
        CRUD.log("The Init method for you connection adapter is not implemented!");
        debugger;
    };
    this.Delete = function(what) {
        CRUD.log("The Delete method for your connection adaptor is not implemented!");
        debugger;
    };
    this.Persist = function(what) {
        CRUD.log("The Persist method for your connection adaptor is not implemented!");
        debugger;
    };
    this.Find = function(what, filters, sorting, justthese, options, filters) {
        CRUD.log("The Find method for your connection adaptor is not!");
        debugger;
    };
    return this;
};

CRUD.Entity = function(className, methods) {
    this.__values__ = {};
    this.__dirtyValues__ = {};
    return this;
};


CRUD.Entity.prototype = {

    getID: function() {
        return this.get(CRUD.EntityManager.getPrimary(this.getType())) || false;
    },

    asObject: function() {
        return this.__values__;
    },

    /** 
     * Proxy find function, that can be run on the entity instance itself.
     * Makes sure you can create object A, and find just relations connected to it.
     * example:
     *
     * var Project = new Project(1).then(function(proj) {  proj.find(Catalog).then(function( catalogs) { CRUD.log("Fetched catalogs!", catalogs); }});
     * // versus
     * var Project = CRUD.Find(Project, { ID : 1 }).then(function(proj) { CRUD.log("Found project 1", proj); });
     * // or use a join:
     * CRUD.Find(Project, { Catalog: { ID: 1 }}).then(function(projects) { CRUD.log("Found projects connected to catalog 1 !", projects); });
     *
     * @returns Promise
     */
    Find: function(type, filters, options) {
        options = options || {};
        filters = filters || {};
        filters[this.getType()] = {};
        filters[this.getType()][CRUD.EntityManager.getPrimary(this.getType())] = this.getID();
        return CRUD.Find(type, filters, options);
    },

    /**
     * Get al list of all the values to display.
     */
    getValues: function() {
        var v = this.__values__;
        if (this.____dirtyValues____ && Array.from(this.____dirtyValues____).length > 0) {
            for (var k in this.__dirtyValues__) {
                v[k] = this.__dirtyValues__[k];
            }
        }
        v.ID = this.getID();
        return v;
    },

    importValues: function(values, dirty) {
        for (var field in values) {
            if (CRUD.EntityManager.entities[this.getType()].autoSerialize.indexOf(field) > -1) {
                if (typeof values[field] !== "object") {
                    this.__values__[field] = JSON.parse(values[field]);
                    continue;
                }
            }
            this.__values__[field] = values[field];
        }
        if (dirty) {
            this.__dirtyValues__ = this.__values__;
            this.__values__ = {};
        }
        return this;
    },

    /**
     * Accessor. Gets one field, optionally returns the default value.
     */
    get: function(field, def) {
        var ret;
        if (field in this.__dirtyValues__) {
            ret = this.__dirtyValues__[field];
        } else if ((field in this.__values__)) {
            ret = this.__values__[field];
        } else {
            CRUD.log("Could not find field '" + field + "' in '" + this.getType() + "' (for get)");
        }
        return ret;
    },

    /**
     * Setter, accepts key / value or object with keys/values
     */
    set: function(field, value) {
        if ((field in this)) {
            if (this.get(field) !== value && !([null, undefined].indexOf(this.get(field)) > -1 && [null, undefined].indexOf(value) > -1)) {
                if (CRUD.EntityManager.entities[this.getType()].autoSerialize.indexOf(field) > -1) {
                    if (JSON.stringify(this.get(field)) != JSON.stringify(value)) {
                        this.__dirtyValues__[field] = value;
                    }
                } else {
                    this.__dirtyValues__[field] = value;
                }
            }
        } else {
            CRUD.log("Could not find field '" + field + "' in '" + this.getType() + "' (for set)");
        }
    },

    /**
     * Persist changes on object using CRUD.Entity.set through the adapter.
     */
    Persist: function(forceInsert) {
        var that = this,
            thatType = this.getType();
        return new Promise(function(resolve, fail) {
            if (!forceInsert && Object.keys(that.__dirtyValues__).length == 0) return resolve();

            if (that.get(CRUD.EntityManager.getPrimary(that.getType())) === false || forceInsert) {
                var defaults = CRUD.EntityManager.entities[that.getType()].defaultValues;
                if (Object.keys(defaults).length > 0) {
                    for (var i in defaults) {
                        if ((i in that) && !that.__dirtyValues__[i]) {
                            that.__dirtyValues__[i] = defaults[i];
                        }
                    }
                }
            }

            return CRUD.EntityManager.getAdapter().Persist(that, forceInsert).then(function(result) {
                CRUD.log(that.getType() + " has been persisted. Result: " + result.Action + ". New Values: " + JSON.stringify(that.__dirtyValues__));
                if (result.Action == "inserted") {
                    that.__dirtyValues__[CRUD.EntityManager.getPrimary(thatType)] = result.ID;
                    if (!(thatType in CRUD.EntityManager.cache)) {
                        CRUD.EntityManager.cache[thatType] = {};
                    }
                    CRUD.EntityManager.cache[thatType][result.ID] = that;
                }
                for (var i in that.__dirtyValues__) {
                    that.__values__[i] = that.__dirtyValues__[i];
                }
                that.__dirtyValues__ = {};
                that.ID = that.__values__[CRUD.EntityManager.getPrimary(thatType)];

                resolve(result);
            }, function(e) {
                CRUD.log("Error saving CRUD", that, e);
                fail(e);
            });

        });
    },


    /**
     * Delete the object via the adapter.
     * Allows you to call Persist() again on the same object by just setting the ID to false.
     */
    Delete: function() {
        var that = this;
        return CRUD.EntityManager.getAdapter().Delete(that).then(function(result) {
            if (result.Action == 'deleted') {
                CRUD.log(that.getType() + " " + that.getID() + " has been deleted! ");
                delete CRUD.EntityManager.cache[that.getType()][that.getID()];
                that.__values__[CRUD.EntityManager.getPrimary(that.getType())].ID = false;
            };
            return result;
        });
    },

    getType: function() {
        return this.__className__;
    },


    /** 
     * Connect 2 entities regardles of their relationship type.
     * Pass the object you want to connect this entity to to this function and
     * this will find out what it needs to do to set the correct properties in your persistence layer.
 * @TODO: update thisPrimary,    thatPrimary resolve functions to allow mapping using RELATION_CUSTOM,
    also,
    using identified_by propertys
     */
    Connect: function(to) {
        var targetType = to.getType();
        var thisType = this.getType();
        var thisPrimary = this.dbSetup.primary;
        var targetPrimary = to.dbSetup.primary;
        var that = this;
        new Promise(function(resolve, fail) {
            Promise.all([that.Persist(), to.Persist()]).then(function() {
                switch (that.dbSetup.relations[targetType]) {
                    case CRUD.RELATION_SINGLE:
                        to.set(thisPrimary, that.getID());
                        that.set(targetPrimary, to.getID());
                        break;
                    case CRUD.RELATION_FOREIGN:
                        if ((thisPrimary in to)) {
                            to.set(thisPrimary, that.getID());
                        }
                        if ((targetPrimary in that)) {
                            that.set(targetPrimary, to.getID());
                        }
                        break;
                    case CRUD.RELATION_MANY:
                        var connector = new window[that.dbSetup.connectors[targetType]]();
                        connector.set(thisPrimary, that.getID());
                        connector.set(targetPrimary, to.getID());
                        connector.Persist().then(resolve, fail);
                        return;
                        break;
                    case CRUD.RELATION_CUSTOM:
                        //@TODO
                        break;
                }
                if (that.dbSetup.relations[to.getType()] != CRUD.RELATION_MANY) {
                    Promise.all([to.Persist(), from.Persist()]).then(resolve, fail);
                }
            }, fail);
        });
    },

    Disconnect: function(from) {
        var targetType = from.getType();
        var thisType = this.getType();
        var thisPrimary = CRUD.EntityManager.getPrimary(this);
        var targetPrimary = CRUD.Entitymanager.getPrimary(from);
        var that = this;

        new Promise(function(resolve, fail) {
            Promise.all([that.Persist(), from.Persist()]).then(function() {
                switch (this.dbSetup.relations[from.getType()]) {
                    case CRUD.RELATION_SINGLE:
                        from.set(thisPrimary, null);
                        that.set(targetPrimary, null);
                        break;
                    case CRUD.RELATION_FOREIGN:
                        if ((thisPrimary in from)) {
                            from.set(thisPrimary, null);
                        }
                        if ((targetPrimary in that)) {
                            that.set(targetPrimary, null);
                        }
                        break;
                    case CRUD.RELATION_MANY:
                        var filters = {};
                        filters[thisPrimary] = this.getID();
                        filters[targetPrimary] = from.getID();

                        CRUD.FindOne(this.dbSetup.connectors[targetType], filters).then(function(target) {
                            target.Delete().then(resolve, fail);
                        }, fail);
                        return;
                        break;
                    case CRUD.RELATION_CUSTOM:
                        // TODO: implement.
                        break;
                }
                Promise.all([that.Persist(), this.Persist()]).then(resolve, fail);
            }, fail);
        });
    },


    primaryKeyInit: function(ID) {
        this.ID = ID || false;
        if (this.ID !== false) {
            return this.Find({
                "ID": ID
            });
        }
    },
    toJSON: function() {
        return this.asObject();
    }
};

if (!('clone' in Object)) {
    Object.clone = function(el) {
        return JSON.parse(JSON.stringify(el));
    };
};
/**
 * handy Shorthand function
 */
CRUD.executeQuery = function(query, bindings) {
    return CRUD.EntityManager.getAdapter().db.execute(query, bindings || []);
};

CRUD.SQLiteAdapter = function(database, dbOptions) {
    this.databaseName = database;
    this.dbOptions = dbOptions;
    this.lastQuery = false;
    this.initializing = true;
    CRUD.ConnectionAdapter.apply(this, arguments);
    var db;
    var self = this;

    this.Init = function() {
        this.db = db = new CRUD.Database(self.databaseName);
        return db.connect().then(function() {
            CRUD.log("SQLITE connection created to ", self.databaseName);
            return verifyTables().then(function() {
                self.initializing = false;
            });
        });
    };

    function updateQuerySuccess(resultSet) {
        CRUD.stats.writesExecuted++;
        resultSet.Action = 'updated';
        return resultSet;
    }

    function updateQueryError(err, tx) {
        console.error("Update query error!", err);
        CRUD.stats.writesExecuted++;
        return;
    }

    function insertQuerySuccess(resultSet) {
        resultSet.Action = 'inserted';
        resultSet.ID = resultSet.insertId;
        CRUD.stats.writesExecuted++;
        return resultSet;
    }

    function insertQueryError(err, tx) {
        CRUD.stats.writesExecuted++;
        console.error("Insert query error: ", err);
        return err;
    }

    var verifyTables = function() {
            CRUD.log('verifying that tables exist');
            var tables = [],
                indexes = {};
            // fetch existing tables
            return db.execute("select type,name,tbl_name from sqlite_master").then(function(resultset) {
                return resultset.rows
                    .filter(function(row) {
                        return (row.name.indexOf('sqlite_autoindex') > -1 || row.name == '__WebKitDatabaseInfoTable__') ? false : true;
                    })
                    .map(function(row) {
                        if (row.type == 'table') {
                            tables.push(row.tbl_name);
                        } else if (row.type == 'index') {
                            if (!(row.tbl_name in indexes)) {
                                indexes[row.tbl_name] = [];
                            }
                            indexes[row.tbl_name].push(row.name);
                        }
                    })
            }).then(function() {
                // verify that all tables exist
                return Promise.all(Object.keys(CRUD.EntityManager.entities).map(function(entityName) {
                    var entity = CRUD.EntityManager.entities[entityName];
                    if (tables.indexOf(entity.table) == -1) {
                        if (!entity.createStatement) {
                            throw "No create statement found for " + entity.className + ". Don't know how to create table.";
                        }
                        return db.execute(entity.createStatement).then(function() {
                            tables.push(entity.table);
                            localStorage.setItem('database.version.' + entity.table, ('migrations' in entity) ? Math.max.apply(Math, Object.keys(entity.migrations)) : 1);
                            CRUD.log(entity.className + " table created.");
                            return entity;
                        }, function(err) {
                            CRUD.log("Error creating " + entity.className, err);
                            throw "Error creating table: " + entity.table + " for " + entity.className;
                        }).then(createFixtures).then(function() {
                            CRUD.log("Table created and fixtures inserted for ", entity.className);
                            return;
                        });
                    }
                    return;
                }));
            }).then(function() {
                // verify that all indexes exist.
                return Promise.all(Object.keys(CRUD.EntityManager.entities).map(function(entityName) {
                    var entity = CRUD.EntityManager.entities[entityName];
                    if (entity.migrations) {
                        var currentVersion = !localStorage.getItem('database.version.' + entity.table) ? 1 : parseInt(localStorage.getItem('database.version.' + entity.table), 10);
                        if (isNaN(currentVersion)) {
                            currentVersion = 1;
                        }
                        var highestVersion = Math.max.apply(Math, Object.keys(entity.migrations));
                        if (currentVersion == highestVersion) return;
                        return Promise.all(Object.keys(entity.migrations).map(function(version) {
                            if (parseInt(version) > currentVersion) {
                                return Promise.all(entity.migrations[version].map(function(migration, idx) {
                                    CRUD.log('Executing migration: ', migration);
                                    return db.execute(migration).then(function(result) {
                                        CRUD.log("Migration success!", migration, result);
                                        return idx;
                                    }, function(err) {
                                        CRUD.log("Migration failed!", idx, version, migration);
                                        throw "Migration " + version + " failed for entity " + entityName;
                                    });
                                })).then(function(results) {
                                    CRUD.log("All migrations executed for " + entityName + " version ", version);
                                    return {
                                        version: version,
                                        results: results
                                    };
                                }, function(err) {
                                    throw "Migration failed for entity " + entityName;
                                });
                            }
                            return {
                                version: version,
                                results: []
                            };
                        })).then(function(results) {
                            var executed = results.filter(function(migration) {
                                return migration.results.length == CRUD.EntityManager.entities[entityName].migrations[migration.version].length
                            }).map(function(migration) {
                                return migration.version;
                            });
                            CRUD.log("Migrations executed for  " + entity.table, ": " + executed.join(",") + ". Version is now: " + highestVersion);
                            localStorage.setItem('database.version.' + entity.table, highestVersion);
                        });
                    }
                }));
            }).then(function() {
                // create listed indexes if they don't already exist.
                return Promise.all(Object.keys(CRUD.EntityManager.entities).map(function(entityName) {
                    var entity = CRUD.EntityManager.entities[entityName];
                    if (('indexes' in entity)) {
                        return Promise.all(entity.indexes.map(function(index) {
                            var indexName = index.replace(/\W/g, '') + '_idx';
                            if (!(entity.table in indexes) || indexes[entity.table].indexOf(indexName) == -1) {
                                return db.execute("create index if not exists " + indexName + " on " + entity.table + " (" + index + ")").then(function(result) {
                                    CRUD.log("index created: ", entity.table, index, indexName);
                                    if (!(entity.table in indexes)) {
                                        indexes[entity.table] = [];
                                    }
                                    indexes[entity.table].push(indexName);
                                    return;
                                });
                            }
                            return;
                        }));
                    }
                }));
            }).then(function(result) {
                CRUD.log("All migrations are done!");
                self.initializing = false;
            });
        },

        createFixtures = function(entity) {
            return new Promise(function(resolve, reject) {
                if (!entity.fixtures) return resolve();
                return Promise.all(entity.fixtures.map(function(fixture) {

                    CRUD.fromCache(entity.className, fixture).Persist(true);
                })).then(resolve, reject);
            });
        },

        delayUntilSetupDone = function(func) {
            if (!self.initializing) {
                return func();
            } else {
                setTimeout(delayUntilSetupDone, 50, func);
            }
        };

    this.Find = function(what, filters, options) {
        var builder = new CRUD.Database.SQLBuilder(what, filters, options);
        var query = builder.buildQuery();

        return new Promise(function(resolve, fail) {
            delayUntilSetupDone(function() {
                CRUD.log("Executing query via sqliteadapter: ", options, query);
                db.execute(query.query, query.parameters).then(function(result) {
                        resolve(result.rows)
                    },
                    function(resultSet, sqlError) {
                        CRUD.log('SQL Error in FIND : ', sqlError, resultSet, query);
                        fail();
                    });
            });
        });
    };

    this.Persist = function(what, forceInsert) {
        CRUD.stats.writesQueued++;
        var query = [],
            values = [],
            valmap = [],
            names = [];

        function mapValues(field) {
            names.push(field);
            values.push('?');
            valmap.push(what.__dirtyValues__[field]);
        }

        function mapChangedValues(field) {
            if (!(field in what.__dirtyValues__) && !(field in what.__values__)) {
                names.push(field);
                values.push('?');
                valmap.push(CRUD.EntityManager.entities[what.getType()].defaultValues[field]);
            }
        }

        function mapAutoSerialize(field) {
            if (names.indexOf(field) > -1) {
                valmap[names.indexOf(field)] = JSON.stringify(valmap[names.indexOf(field)]);
            }
        }

        // iterate all fields changed
        Object.keys(what.__dirtyValues__).map(mapValues);
        // add defaults
        Object.keys(CRUD.EntityManager.entities[what.getType()].defaultValues).map(mapChangedValues);

        // json_encode any fields that are defined as needing serializing
        CRUD.EntityManager.entities[what.getType()].autoSerialize.map(mapAutoSerialize);

        if (what.getID() === false || undefined === what.getID() || forceInsert) { // new object : insert.
            // insert
            query.push('INSERT INTO ', CRUD.EntityManager.entities[what.getType()].table, '(', names.join(","), ') VALUES (', values.join(","), ');');
            CRUD.log(query.join(' '), valmap);
            return db.execute(query.join(' '), valmap).then(insertQuerySuccess, insertQueryError);
        } else { // existing : build an update query.
            query.push('UPDATE', CRUD.EntityManager.entities[what.getType()].table, 'SET', names.map(function(name) {
                return name + ' = ?';
            }).join(','));
            valmap.push(what.getID());
            query.push('WHERE', CRUD.EntityManager.getPrimary(what.getType()), '= ?');

            return db.execute(query.join(' '), valmap).then(updateQuerySuccess, updateQueryError);
        }
    };

    this.Delete = function(what) {
        if (what.getID() !== false) {
            query = ['delete from', CRUD.EntityManager.entities[what.getType()].table, 'where', CRUD.EntityManager.getPrimary(what.getType()), '= ?'].join(' ');
            return db.execute(query, [what.getID()]).then(function(resultSet) {
                resultSet.Action = 'deleted';
                return resultSet;
            }, function(e) {
                CRUD.log("error deleting element from db: ", e);
                throw e;
            });
        } else {
            return false;
        }
    };

    return this;
};


/*
---

CRUD.Database.js, a simple database abstraction layer.
Adapted from mootools Database.js by  Dipl.-Ing. (FH) AndrÃ© Fiedler <kontakt@visualdrugs.net>
Removed all moo dependencies and converted to POJS
December 2013: Updated for use of promises.
...
*/
CRUD.Database = function(name, options) {
    options = options || {
        version: '1.0',
        estimatedSize: 655360
    };

    var lastInsertRowId = 0;
    var db = false;
    var dbName = name || false;

    this.lastInsertId = function() {
        return lastInsertRowId;
    };

    this.close = function() {
        return db.close();
    };

    this.getDB = function() {
        return db;
    };

    var queryQueue = [];

    /**
     * Execute a db query and promise a resultset.
     * Queries are queue up based upon if they are insert or select queries.
     * selects get highest priority to not lock the UI when batch inserts or updates
     * are happening.
     */
    this.execute = function(sql, valueBindings) {
        if (!db) return;
        return new Promise(function(resolve, fail) {
            queryQueue[sql.indexOf('SELECT') === 0 ? 'unshift' : 'push']({
                sql: sql,
                valueBindings: valueBindings,
                resolve: resolve,
                fail: fail
            });
            setTimeout(processQueue, 10);
        });
    };

    function processQueue() {
        if (queryQueue.length > 0) {
            db.transaction(function(transaction) {
                var localQueue = queryQueue.splice(0, 25);
                if (localQueue.length === 0) return;
                localQueue.map(function(query) {

                    function sqlOK(transaction, rs) {
                        var output = {
                            rows: []
                        };
                        for (var i = 0; i < rs.rows.length; i++) {
                            output.rows.push(rs.rows.item(i));
                        }
                        if (('rowsAffected' in rs)) {
                            output.rowsAffected = rs.rowsAffected;
                            if (rs.rowsAffected > 0 && query.sql.indexOf('INSERT INTO') > -1) {
                                output.insertId = rs.insertId;
                            }
                        }
                        query.resolve(output);
                    }

                    function sqlFail(transaction, error) {
                        CRUD.log("SQL FAIL!!", error, transaction);
                        query.fail(error, transaction);
                    }
                    transaction.executeSql(query.sql, query.valueBindings, sqlOK, sqlFail);
                });
            });
        }
    }

    this.connect = function() {
        return new Promise(function(resolve, fail) {
            try {
                db = openDatabase(dbName, options.version, '', options.estimatedSize);
                if (!db) {
                    fail("could not open database " + dbName);
                } else {
                    CRUD.log("DB connection to ", dbName, " opened!");
                    resolve(this);
                }
            } catch (E) {
                CRUD.log("DB ERROR " + E.toString());
                fail('ERROR!' + E.toString(), E);
            }
        });
    };
};

/**
 * My own query builder, ported from PHP to JS.
 * Should still be refactored and prettified, but works pretty nice so far.
 */
CRUD.Database.SQLBuilder = function(entity, filters, options) {
    this.entity = entity instanceof CRUD.Entity ? entity.getType() : entity;
    this.entityConfig = CRUD.EntityManager.entities[this.entity];
    this.filters = filters || {};
    this.options = options || {};
    this.justthese = [];
    this.wheres = [];
    this.joins = [];
    this.fields = [];
    this.orders = [];
    this.groups = [];
    this.parameters = []; // parameters to bind to sql query.

    Object.keys(this.filters).map(function(key) {
        this.buildFilters(key, this.filters[key], this.entity);
    }, this);

    if (this.options.orderBy) {
        this.orders.push(this.prefixFieldNames(this.options.orderBy.replace('ORDER BY', '')));
    } else {
        if (this.entityConfig.orderProperty && this.entityConfig.orderDirection && this.orders.length === 0) {
            this.orders.push(this.getFieldName(this.entityConfig.orderProperty) + " " + this.entityConfig.orderDirection);
        }
    }

    if (this.options.groupBy) {
        this.groups.push(this.options.groupBy.replace('GROUP BY', ''));
    }

    this.limit = this.options.limit ? 'LIMIT ' + options.limit : 'LIMIT 0,2000';

    (this.options.justthese || CRUD.EntityManager.entities[this.entity].fields).map(function(field) {
        this.fields.push(this.getFieldName(field));
    }, this);
};


CRUD.Database.SQLBuilder.prototype = {

    getFieldName: function(field, table) {
        return (table || this.entityConfig.table) + '.' + field;
    },

    prefixFieldNames: function(text) {
        var fields = text.split(',');
        return fields.map(function(field) {
            var f = field.trim().split(' ');
            var direction = f[1].toUpperCase().match(/(ASC|DESC)/)[0];
            field = f[0];
            if (this.entityConfig.fields.indexOf(field) > -1) {
                field = this.getFieldName(field);
            }
            return field + ' ' + direction;
        }, this).join(', ');
    },

    buildFilters: function(what, value, _class) {
        var relatedClass = CRUD.EntityManager.hasRelation(_class, what);
        if (relatedClass) {
            for (var val in value) {
                this.buildFilters(val, value[val], what);
                this.buildJoins(_class, what);
            }
        } else if (!isNaN(parseInt(what, 10))) { // it's a custom sql where clause, just field=>value). unsafe because parameters are unbound, but very for custom queries.
            this.wheres.push(value);
        } else { // standard field=>value whereclause. Prefix with tablename for easy joins and push a value to the .
            if (what == 'ID') what = CRUD.EntityManager.getPrimary(_class);
            this.wheres.push(this.getFieldName(what, CRUD.EntityManager.entities[_class].table) + ' = ?');
            this.parameters.push(value);
        }
    },

    buildJoins: function(theClass, parent) { // determine what joins to use
        if (!parent) return; // nothing to join on, skip.
        var entity = CRUD.EntityManager.entities[theClass];
        parent = CRUD.EntityManager.entities[parent];

        switch (parent.relations[entity.className]) { // then check the relationtype
            case CRUD.RELATION_SINGLE:
            case CRUD.RELATION_FOREIGN:
                if (entity.fields.indexOf(parent.primary) > -1) {
                    this.addJoin(parent, entity, parent.primary);
                } else if (parent.fields.indexOf(entity.primary) > -1) {
                    this.addJoin(parent, entity, entity.primary);
                }
                break;
            case CRUD.RELATION_MANY: // it's a many:many relation. Join the connector table and then the related one.
                connectorClass = parent.connectors[entity.getType()];
                conn = CRUD.EntityManager.entities[connectorClass];
                this.addJoin(conn, entity, entity.primary).addJoin(parent, conn, parent.primary);
                break;
            case CRUD.RELATION_CUSTOM:
                var rel = parent.relations[entity.getType()];
                this.joins = this.joins.unshift(['LEFT JOIN', entity.table, 'ON', this.getFieldName(rel.sourceProperty, parent.table), '=', this.getFieldName(rel.targetProperty, entity.table)].join(' '));
                break;
            default:
                throw new Exception("Warning! class " + parent.getType() + " probably has no relation defined for class " + entity.getType() + "  or you did something terribly wrong..." + JSON.encode(parent.relations[_class]));
        }
    },

    addJoin: function(what, on, fromPrimary, toPrimary) {
        var join = ['LEFT JOIN', what.table, 'ON', this.getFieldName(fromPrimary, on.table), '=', this.getFieldName(toPrimary || fromPrimary, what.table)].join(' ');
        if (this.joins.indexOf(join) == -1) {
            this.joins.push(join);
        }
        return this;
    },

    buildQuery: function() {

        var where = this.wheres.length > 0 ? ' WHERE ' + this.wheres.join(" \n AND \n\t") : '';
        var order = (this.orders.length > 0) ? ' ORDER BY ' + this.orders.join(", ") : '';
        var group = (this.groups.length > 0) ? ' GROUP BY ' + this.groups.join(", ") : '';
        var query = 'SELECT ' + this.fields.join(", \n\t") + "\n FROM \n\t" + CRUD.EntityManager.entities[this.entity].table + "\n " + this.joins.join("\n ") + where + ' ' + group + ' ' + order + ' ' + this.limit;
        return ({
            query: query,
            parameters: this.parameters
        });
    },

    getCount: function() {
        var where = (this.wheres.length > 0) ? ' WHERE ' + this.wheres.join(" \n AND \n\t") : '';
        var group = (this.groups.length > 0) ? ' GROUP BY ' + this.groups.join(", ") : '';
        var query = "SELECT count(*) FROM \n\t" + CRUD.EntityManager.entities[this.entity].table + "\n " + this.joins.join("\n ") + where + ' ' + group;
        return (query);
    }
};
;
/**
 * These are the entity mappings (ActiveRecord / ORM objects) for DuckieTV.
 * There's an object for each database table where information is stored.
 * These are all based on CreateReadUpdateDelete.js : http://schizoduckie.github.io/CreateReadUpdateDelete.js
 * CRUD.JS creates automatic SQL queries from these objects and handles relationships between them.
 * It also provides the automatic execution of the create statements when a database table is not available.
 */

/**
 * Define POJO named functions for all the entities used.
 * These will be extended by CreateReadUpdateDelete.js. It is important to call the CRUD.Entity constructor
 * So that each instance can be set up with instance __values__ and __dirtyValues__ properties.
 */

/**
 * @constructor
 * @extends CRUD.Entity
 * @property {number} ID_Serie
 * @property {string} name
 * @property {string} overview
 * @property {number} TRAKT_ID
 * @property {number} TVDB_ID
 * @property {number} TMDB_ID
 * @property {string} IMDB_ID
 * @property {string} poster
 * @property {string} fanart
 */
function Serie() {
  CRUD.Entity.call(this)
}

/**
 * @constructor
 * @extends CRUD.Entity
 * @property {number} ID_Season
 * @property {number} seasonnumber
 * @property {string} overview
 * @property {number} TRAKT_ID
 * @property {number} TMDB_ID
 * @property {string} poster
 */
function Season() {
  CRUD.Entity.call(this)
}

/**
 * @constructor
 * @extends CRUD.Entity
 * @property {number} ID_Episode
 * @property {number} ID_Serie
 * @property {number} ID_Season
 * @property {number} seasonnumber
 * @property {number} episodenumber
 * @property {string} episodename
 * @property {number} TRAKT_ID
 * @property {number} TVDB_ID
 * @property {number} TMDB_ID
 * @property {string} IMDB_ID
 * @property {string} filename
 */
function Episode() {
  CRUD.Entity.call(this)
}

function Fanart() {
  CRUD.Entity.call(this)
}

/**
 * @constructor
 * @extends CRUD.Entity
 * @property {number} id
 * @property {number} entity_type
 * @property {number} TMDB_ID
 * @property {string} poster
 * @property {string} fanart
 * @property {string} screenshot
 * @property {number} added
 */
function TMDBFanart() {
  CRUD.Entity.call(this)
}

function Jackett() {
  CRUD.Entity.call(this)
}

/**
 * Allow CRUD.js to register itself and the properties defined on each named function.
 */

CRUD.define(Serie, {
  className: 'Serie',
  table: 'Series',
  primary: 'ID_Serie',
  fields: ['ID_Serie', 'name', 'banner', 'overview', 'TVDB_ID', 'IMDB_ID', 'TVRage_ID', 'actors', 'airs_dayofweek', 'airs_time', 'timezone', 'contentrating', 'firstaired', 'genre', 'country', 'language', 'network', 'rating', 'ratingcount', 'runtime', 'status', 'added', 'addedby', 'fanart', 'poster', 'lastupdated', 'lastfetched', 'nextupdate', 'displaycalendar', 'autoDownload', 'customSearchString', 'watched', 'notWatchedCount', 'ignoreGlobalQuality', 'ignoreGlobalIncludes', 'ignoreGlobalExcludes', 'searchProvider', 'ignoreHideSpecials', 'customSearchSizeMin', 'customSearchSizeMax', 'TRAKT_ID', 'dlPath', 'customDelay', 'alias', 'customFormat', 'TMDB_ID', 'customIncludes', 'customExcludes', 'customSeeders'],
  relations: {
    'Episode': CRUD.RELATION_FOREIGN,
    'Season': CRUD.RELATION_FOREIGN
  },
  indexes: [
    'fanart',
    'TRAKT_ID'
  ],
  createStatement: 'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER DEFAULT(NULL), IMDB_ID VARCHAR(20) DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), ignoreGlobalQuality TINYINT DEFAULT(0), ignoreGlobalIncludes TINYINT DEFAULT(0), ignoreGlobalExcludes TINYINT DEFAULT(0), searchProvider VARCHAR(20) DEFAULT(NULL), ignoreHideSpecials TINYINT DEFAULT(0), customSearchSizeMin INTEGER DEFAULT(NULL), customSearchSizeMax INTEGER DEFAULT(NULL), TRAKT_ID INTEGER DEFAULT(NULL), dlPath TEXT DEFAULT(NULL), customDelay INTEGER DEFAULT(NULL), alias VARCHAR(250) DEFAULT(NULL), customFormat VARCHAR(20) DEFAULT(NULL), TMDB_ID INTEGER DEFAULT(NULL), customIncludes VARCHAR(150) DEFAULT(NULL), customExcludes VARCHAR(150) DEFAULT(NULL), customSeeders INTEGER DEFAULT(NULL) )',

  adapter: 'dbAdapter',
  defaultValues: {

  },
  fixtures: [

  ],
  migrations: {
    5: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER UNIQUE NOT NULL, IMDB_ID INTEGER DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), networkid VARCHAR(50) DEFAULT(NULL), seriesid VARCHAR(50) DEFAULT(NULL), zap2it_id VARCHAR(50) DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, networkid, seriesid, zap2it_id, actors, airs_dayofweek, airs_time, contentrating, firstaired, genre, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, networkid, seriesid, zap2it_id, actors, airs_dayofweek, airs_time, contentrating, firstaired, genre, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate from Series_bak',
      'DROP TABLE Series_bak'
    ],
    6: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER UNIQUE NOT NULL, IMDB_ID INTEGER DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, contentrating, firstaired, genre, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, contentrating, firstaired, genre, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate from Series_bak',
      'DROP TABLE Series_bak'
    ],
    7: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER UNIQUE NOT NULL, IMDB_ID INTEGER DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar from Series_bak',
      'DROP TABLE Series_bak'
    ],
    8: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER UNIQUE NOT NULL, IMDB_ID INTEGER DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched from Series_bak',
      'DROP TABLE Series_bak'
    ],
    9: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER UNIQUE NOT NULL, IMDB_ID INTEGER DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), ignoreGlobalQuality TINYINT DEFAULT(0), ignoreGlobalIncludes TINYINT DEFAULT(0), ignoreGlobalExcludes TINYINT DEFAULT(0) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount from Series_bak',
      'DROP TABLE Series_bak'
    ],
    10: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER UNIQUE NOT NULL, IMDB_ID INTEGER DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), ignoreGlobalQuality TINYINT DEFAULT(0), ignoreGlobalIncludes TINYINT DEFAULT(0), ignoreGlobalExcludes TINYINT DEFAULT(0), searchProvider VARCHAR(20) DEFAULT(NULL) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes from Series_bak',
      'DROP TABLE Series_bak'
    ],
    11: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER UNIQUE NOT NULL, IMDB_ID INTEGER DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), ignoreGlobalQuality TINYINT DEFAULT(0), ignoreGlobalIncludes TINYINT DEFAULT(0), ignoreGlobalExcludes TINYINT DEFAULT(0), searchProvider VARCHAR(20) DEFAULT(NULL), ignoreHideSpecials TINYINT DEFAULT(0) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider from Series_bak',
      'DROP TABLE Series_bak'
    ],
    12: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER UNIQUE NOT NULL, IMDB_ID INTEGER DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), ignoreGlobalQuality TINYINT DEFAULT(0), ignoreGlobalIncludes TINYINT DEFAULT(0), ignoreGlobalExcludes TINYINT DEFAULT(0), searchProvider VARCHAR(20) DEFAULT(NULL), ignoreHideSpecials TINYINT DEFAULT(0), customSearchSizeMin INTEGER DEFAULT(NULL), customSearchSizeMax INTEGER DEFAULT(NULL) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials from Series_bak',
      'DROP TABLE Series_bak'
    ],
    13: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER DEFAULT(NULL), IMDB_ID VARCHAR(20) DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), ignoreGlobalQuality TINYINT DEFAULT(0), ignoreGlobalIncludes TINYINT DEFAULT(0), ignoreGlobalExcludes TINYINT DEFAULT(0), searchProvider VARCHAR(20) DEFAULT(NULL), ignoreHideSpecials TINYINT DEFAULT(0), customSearchSizeMin INTEGER DEFAULT(NULL), customSearchSizeMax INTEGER DEFAULT(NULL), TRAKT_ID INTEGER DEFAULT(NULL) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax from Series_bak',
      'DROP TABLE Series_bak'
    ],
    14: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER DEFAULT(NULL), IMDB_ID VARCHAR(20) DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), ignoreGlobalQuality TINYINT DEFAULT(0), ignoreGlobalIncludes TINYINT DEFAULT(0), ignoreGlobalExcludes TINYINT DEFAULT(0), searchProvider VARCHAR(20) DEFAULT(NULL), ignoreHideSpecials TINYINT DEFAULT(0), customSearchSizeMin INTEGER DEFAULT(NULL), customSearchSizeMax INTEGER DEFAULT(NULL), TRAKT_ID INTEGER DEFAULT(NULL), dlPath TEXT DEFAULT(NULL) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax, TRAKT_ID) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax, TRAKT_ID from Series_bak',
      'DROP TABLE Series_bak'
    ],
    15: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER DEFAULT(NULL), IMDB_ID VARCHAR(20) DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), ignoreGlobalQuality TINYINT DEFAULT(0), ignoreGlobalIncludes TINYINT DEFAULT(0), ignoreGlobalExcludes TINYINT DEFAULT(0), searchProvider VARCHAR(20) DEFAULT(NULL), ignoreHideSpecials TINYINT DEFAULT(0), customSearchSizeMin INTEGER DEFAULT(NULL), customSearchSizeMax INTEGER DEFAULT(NULL), TRAKT_ID INTEGER DEFAULT(NULL), dlPath TEXT DEFAULT(NULL), customDelay INTEGER DEFAULT(NULL) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax, TRAKT_ID, dlPath) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax, TRAKT_ID, dlPath from Series_bak',
      'DROP TABLE Series_bak'
    ],
    16: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER DEFAULT(NULL), IMDB_ID VARCHAR(20) DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), ignoreGlobalQuality TINYINT DEFAULT(0), ignoreGlobalIncludes TINYINT DEFAULT(0), ignoreGlobalExcludes TINYINT DEFAULT(0), searchProvider VARCHAR(20) DEFAULT(NULL), ignoreHideSpecials TINYINT DEFAULT(0), customSearchSizeMin INTEGER DEFAULT(NULL), customSearchSizeMax INTEGER DEFAULT(NULL), TRAKT_ID INTEGER DEFAULT(NULL), dlPath TEXT DEFAULT(NULL), customDelay INTEGER DEFAULT(NULL), alias VARCHAR(250) DEFAULT(NULL), customFormat VARCHAR(20) DEFAULT(NULL) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax, TRAKT_ID, dlPath, customDelay) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax, TRAKT_ID, dlPath, customDelay from Series_bak',
      'DROP TABLE Series_bak'
    ],
    17: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER DEFAULT(NULL), IMDB_ID VARCHAR(20) DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), ignoreGlobalQuality TINYINT DEFAULT(0), ignoreGlobalIncludes TINYINT DEFAULT(0), ignoreGlobalExcludes TINYINT DEFAULT(0), searchProvider VARCHAR(20) DEFAULT(NULL), ignoreHideSpecials TINYINT DEFAULT(0), customSearchSizeMin INTEGER DEFAULT(NULL), customSearchSizeMax INTEGER DEFAULT(NULL), TRAKT_ID INTEGER DEFAULT(NULL), dlPath TEXT DEFAULT(NULL), customDelay INTEGER DEFAULT(NULL), alias VARCHAR(250) DEFAULT(NULL), customFormat VARCHAR(20) DEFAULT(NULL), TMDB_ID INTEGER DEFAULT(NULL) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax, TRAKT_ID, dlPath, customDelay, alias, customFormat) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax, TRAKT_ID, dlPath, customDelay, alias, customFormat from Series_bak',
      'DROP TABLE Series_bak'
    ],
    18: [
      'ALTER TABLE Series RENAME TO Series_bak',
      'CREATE TABLE Series (ID_Serie INTEGER PRIMARY KEY NOT NULL, name VARCHAR(250) DEFAULT(NULL), banner VARCHAR(1024) DEFAULT(NULL), overview TEXT DEFAULT(NULL), TVDB_ID INTEGER DEFAULT(NULL), IMDB_ID VARCHAR(20) DEFAULT(NULL), TVRage_ID INTEGER DEFAULT(NULL), actors VARCHAR(1024) DEFAULT(NULL), airs_dayofweek VARCHAR(10) DEFAULT(NULL), airs_time VARCHAR(15) DEFAULT(NULL), timezone VARCHAR(30) DEFAULT(NULL), contentrating VARCHAR(20) DEFAULT(NULL), firstaired DATE DEFAULT(NULL), genre VARCHAR(50) DEFAULT(NULL), country VARCHAR(50) DEFAULT(NULL), language VARCHAR(50) DEFAULT(NULL), network VARCHAR(50) DEFAULT(NULL), rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), runtime INTEGER DEFAULT(NULL), status VARCHAR(50) DEFAULT(NULL), added DATE DEFAULT(NULL), addedby VARCHAR(50) DEFAULT(NULL), fanart VARCHAR(150) DEFAULT(NULL), poster VARCHAR(150) DEFAULT(NULL), lastupdated TIMESTAMP DEFAULT (NULL), lastfetched TIMESTAMP DEFAULT (NULL), nextupdate TIMESTAMP DEFAULT (NULL), displaycalendar TINYINT DEFAULT(1), autoDownload TINYINT DEFAULT(1), customSearchString VARCHAR(150) DEFAULT(NULL), watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), ignoreGlobalQuality TINYINT DEFAULT(0), ignoreGlobalIncludes TINYINT DEFAULT(0), ignoreGlobalExcludes TINYINT DEFAULT(0), searchProvider VARCHAR(20) DEFAULT(NULL), ignoreHideSpecials TINYINT DEFAULT(0), customSearchSizeMin INTEGER DEFAULT(NULL), customSearchSizeMax INTEGER DEFAULT(NULL), TRAKT_ID INTEGER DEFAULT(NULL), dlPath TEXT DEFAULT(NULL), customDelay INTEGER DEFAULT(NULL), alias VARCHAR(250) DEFAULT(NULL), customFormat VARCHAR(20) DEFAULT(NULL), TMDB_ID INTEGER DEFAULT(NULL), customIncludes VARCHAR(150) DEFAULT(NULL), customExcludes VARCHAR(150) DEFAULT(NULL), customSeeders INTEGER DEFAULT(NULL) )',
      'INSERT OR IGNORE INTO Series (ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax, TRAKT_ID, dlPath, customDelay, alias, customFormat, TMDB_ID) select ID_Serie, name, banner, overview, TVDB_ID, IMDB_ID, TVRage_ID, actors, airs_dayofweek, airs_time, timezone, contentrating, firstaired, genre, country, language, network, rating, ratingcount, runtime, status, added, addedby, fanart, poster, lastupdated, lastfetched, nextupdate, displaycalendar, autoDownload, customSearchString, watched, notWatchedCount, ignoreGlobalQuality, ignoreGlobalIncludes, ignoreGlobalExcludes, searchProvider, ignoreHideSpecials, customSearchSizeMin, customSearchSizeMax, TRAKT_ID, dlPath, customDelay, alias, customFormat, TMDB_ID from Series_bak',
      'DROP TABLE Series_bak'
    ]
  }
}, {

  getEpisodes: function() {
    return Episode.findBySerie({
      ID_Serie: this.getID()
    }, {
      limit: 100000
    })
  },

  getSeasons: function() {
    return Season.findByID_Serie(this.getID())
  },

  /**
     * Fetch episodes as object mapped by TRAKT_ID
     */
  getEpisodesMap: function() {
    return this.getEpisodes().then(function(result) {
      var out = {}
      result.map(function(episode) {
        out[episode.TRAKT_ID] = episode
      })
      return out
    })
  },

  getSeasonsByNumber: function() {
    return this.getSeasons().then(function(seasons) {
      var out = {}
      seasons.map(function(el) {
        out[el.seasonnumber] = el
      })
      return out
    })
  },

  getLatestSeason: function() {
    return Season.findOneByID_Serie(this.getID())
  },

  getActiveSeason: function() {
    var firstAiredFilter = {
      Episode: ['Episodes.ID_Serie = ' + this.getID() + ' AND Episodes.seasonnumber > 0 AND Episodes.firstaired < ' + new Date().getTime()]
    }
    var self = this

    return CRUD.FindOne('Season', firstAiredFilter, {
      orderBy: 'ID_Season desc'
    }).then(function(result) {
      if (result) {
        return result
      }

      return self.getLatestSeason()
    })
  },

  getNotWatchedSeason: function() {
    var notWatchedFilter = {
      Episode: ['Episodes.ID_Serie = ' + this.getID() + ' AND Episodes.seasonnumber > 0 AND Episodes.watched = 0']
    }
    var self = this

    return CRUD.FindOne('Season', notWatchedFilter, {
      orderBy: 'seasonnumber asc'
    }).then(function(result) {
      if (result) {
        return result
      }

      return self.getLatestSeason()
    })
  },

  getSortName: function() {
    if (!this.sortName) {
      this.sortName = this.name.replace('The ', '')
    }
    return this.sortName
  },

  getNextEpisode: function() {
    var filter = ['(Episodes.ID_Serie = ' + this.getID() + ' AND Episodes.firstaired > ' + new Date().getTime() + ') or (Episodes.ID_Serie = ' + this.getID() + ' AND  Episodes.firstaired = 0)']
    return CRUD.FindOne('Episode', filter, {
      orderBy: 'seasonnumber desc, episodenumber asc, firstaired asc'
    }).then(function(result) {
      return result
    })
  },

  getLastEpisode: function() {
    var filter = ['(Episodes.ID_Serie = ' + this.getID() + ' AND Episodes.firstaired > 0 and Episodes.firstAired < ' + new Date().getTime() + ')']
    return CRUD.FindOne('Episode', filter, {
      orderBy: 'seasonnumber desc, episodenumber desc, firstaired desc'
    }).then(function(result) {
      return result
    })
  },

  toggleAutoDownload: function() {
    this.autoDownload = this.autoDownload == 1 ? 0 : 1
    this.Persist()
  },

  toggleCalendarDisplay: function() {
    this.displaycalendar = this.displaycalendar == 1 ? 0 : 1
    this.Persist()
  },

  markSerieAsWatched: function(watchedDownloadedPaired, $rootScope) {
    var self = this
    return new Promise(function(resolve) {
      self.getEpisodes().then(function(episodes) {
        episodes.forEach(function(episode) {
          if (episode.hasAired() && (!episode.isWatched())) {
            return episode.markWatched(watchedDownloadedPaired, $rootScope)
          }
        })
        return resolve(true)
      })
    })
  },

  markSerieAsDownloaded: function($rootScope) {
    var self = this
    return new Promise(function(resolve) {
      self.getEpisodes().then(function(episodes) {
        episodes.forEach(function(episode) {
          if (episode.hasAired() && (!episode.isDownloaded())) {
            return episode.markDownloaded($rootScope)
          }
        })
        return resolve(true)
      })
    })
  },

  markSerieAsUnWatched: function($rootScope) {
    var self = this
    return new Promise(function(resolve) {
      self.getEpisodes().then(function(episodes) {
        episodes.forEach(function(episode) {
          if (episode.isWatched()) {
            return episode.markNotWatched($rootScope)
          }
        })
        return resolve(true)
      })
    })
  },

  isAnime: function() {
    return (this.genre && this.genre.indexOf('anime') > -1)
  }
})

CRUD.define(Season, {
  className: 'Season',
  table: 'Seasons',
  primary: 'ID_Season',
  fields: ['ID_Season', 'ID_Serie', 'poster', 'overview', 'seasonnumber', 'ratings', 'ratingcount', 'watched', 'notWatchedCount', 'TRAKT_ID', 'TMDB_ID'],
  relations: {
    'Serie': CRUD.RELATION_FOREIGN,
    'Episode': CRUD.RELATION_FOREIGN
  },
  indexes: [
    'ID_Serie'
  ],
  orderProperty: 'seasonnumber',
  orderDirection: 'DESC',
  createStatement: 'CREATE TABLE Seasons ( ID_Season INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, poster VARCHAR(255), overview TEXT NULL, seasonnumber INTEGER, ratings INTEGER NULL, ratingcount INTEGER NULL, watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), TRAKT_ID INTEGER DEFAULT(NULL), TMDB_ID INTEGER DEFAULT(NULL), UNIQUE (ID_Serie, seasonnumber) ON CONFLICT REPLACE )',
  adapter: 'dbAdapter',
  defaultValues: {},
  migrations: {
    2: [
      'ALTER TABLE Seasons RENAME TO Seasons_bak',
      'CREATE TABLE Seasons ( ID_Season INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, poster VARCHAR(255), seasonnumber INTEGER, UNIQUE (ID_Serie, seasonnumber) ON CONFLICT REPLACE)',
      'INSERT OR IGNORE INTO Seasons (ID_Season, ID_Serie, poster, seasonnumber) select ID_Season, ID_Serie, poster, seasonnumber from Seasons_bak',
      'DROP TABLE Seasons_bak'
    ],
    3: [
      'ALTER TABLE Seasons RENAME TO Seasons_bak',
      'CREATE TABLE Seasons ( ID_Season INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, poster VARCHAR(255), seasonnumber INTEGER, overview TEXT NULL, ratings INTEGER NULL, ratingcount INTEGER NULL, UNIQUE (ID_Serie, seasonnumber) ON CONFLICT REPLACE)',
      'INSERT OR IGNORE INTO Seasons (ID_Season, ID_Serie, poster, seasonnumber) select ID_Season, ID_Serie, poster, seasonnumber from Seasons_bak',
      'DROP TABLE Seasons_bak'
    ],
    4: [
      'ALTER TABLE Seasons RENAME TO Seasons_bak',
      'CREATE TABLE Seasons ( ID_Season INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, poster VARCHAR(255), seasonnumber INTEGER, overview TEXT NULL, ratings INTEGER NULL, ratingcount INTEGER NULL, watched TINYINT DEFAULT(0), UNIQUE (ID_Serie, seasonnumber) ON CONFLICT REPLACE)',
      'INSERT OR IGNORE INTO Seasons (ID_Season, ID_Serie, poster, overview, seasonnumber, ratings, ratingcount) select ID_Season, ID_Serie, poster, overview, seasonnumber, ratings, ratingcount from Seasons_bak',
      'DROP TABLE Seasons_bak'
    ],
    5: [
      'ALTER TABLE Seasons RENAME TO Seasons_bak',
      'CREATE TABLE Seasons ( ID_Season INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, poster VARCHAR(255), overview TEXT NULL, seasonnumber INTEGER, ratings INTEGER NULL, ratingcount INTEGER NULL, watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), UNIQUE (ID_Serie, seasonnumber) ON CONFLICT REPLACE )',
      'INSERT OR IGNORE INTO Seasons (ID_Season, ID_Serie, poster, overview, seasonnumber, ratings, ratingcount,watched) select ID_Season, ID_Serie, poster, overview, seasonnumber, ratings, ratingcount,watched from Seasons_bak',
      'DROP TABLE Seasons_bak'
    ],
    6: [
      'ALTER TABLE Seasons RENAME TO Seasons_bak',
      'CREATE TABLE Seasons ( ID_Season INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, poster VARCHAR(255), overview TEXT NULL, seasonnumber INTEGER, ratings INTEGER NULL, ratingcount INTEGER NULL, watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), TRAKT_ID INTEGER DEFAULT(NULL), UNIQUE (ID_Serie, seasonnumber) ON CONFLICT REPLACE )',
      'INSERT OR IGNORE INTO Seasons (ID_Season, ID_Serie, poster, overview, seasonnumber, ratings, ratingcount,watched, notWatchedCount) select ID_Season, ID_Serie, poster, overview, seasonnumber, ratings, ratingcount,watched, notWatchedCount from Seasons_bak',
      'DROP TABLE Seasons_bak'
    ],
    7: [
      'ALTER TABLE Seasons RENAME TO Seasons_bak',
      'CREATE TABLE Seasons ( ID_Season INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, poster VARCHAR(255), overview TEXT NULL, seasonnumber INTEGER, ratings INTEGER NULL, ratingcount INTEGER NULL, watched TINYINT DEFAULT(0), notWatchedCount INTEGER DEFAULT(0), TRAKT_ID INTEGER DEFAULT(NULL), TMDB_ID INTEGER DEFAULT(NULL), UNIQUE (ID_Serie, seasonnumber) ON CONFLICT REPLACE )',
      'INSERT OR IGNORE INTO Seasons (ID_Season, ID_Serie, poster, overview, seasonnumber, ratings, ratingcount, watched, notWatchedCount, TRAKT_ID) select ID_Season, ID_Serie, poster, overview, seasonnumber, ratings, ratingcount, watched, notWatchedCount, TRAKT_ID from Seasons_bak',
      'DROP TABLE Seasons_bak'
    ]
  }
}, {
  getEpisodes: function() {
    return Episode.findByID_Season(this.getID())
  },
  markSeasonAsWatched: function(watchedDownloadedPaired, $rootScope) {
    var self = this
    return new Promise(function(resolve) {
      self.getEpisodes().then(function(episodes) {
        episodes.forEach(function(episode) {
          if (episode.hasAired() && (!episode.isWatched())) {
            return episode.markWatched(watchedDownloadedPaired, $rootScope)
          }
        })
        self.watched = 1
        self.Persist()
        return resolve(true)
      })
    })
  },
  markSeasonAsUnWatched: function($rootScope) {
    var self = this
    return new Promise(function(resolve) {
      self.getEpisodes().then(function(episodes) {
        episodes.forEach(function(episode) {
          if (episode.isWatched()) {
            return episode.markNotWatched($rootScope)
          }
        })
        self.watched = 0
        self.Persist()
        return resolve(true)
      })
    })
  }
})

CRUD.define(Episode, {
  className: 'Episode',
  table: 'Episodes',
  primary: 'ID_Episode',
  fields: ['ID_Episode', 'ID_Serie', 'ID_Season', 'TVDB_ID', 'episodename', 'episodenumber', 'seasonnumber', 'firstaired', 'firstaired_iso', 'IMDB_ID', 'language', 'overview', 'rating', 'ratingcount', 'filename', 'images', 'watched', 'watchedAt', 'downloaded', 'magnetHash', 'TRAKT_ID', 'leaked', 'absolute', 'TMDB_ID'],
  autoSerialize: ['images'],
  relations: {
    'Serie': CRUD.RELATION_FOREIGN,
    'Season': CRUD.RELATION_FOREIGN
  },
  createStatement: 'CREATE TABLE Episodes ( ID_Episode INTEGER PRIMARY KEY NOT NULL, ID_Serie INTEGER NOT NULL, ID_Season INTEGER NULL, TVDB_ID INTEGER DEFAULT(NULL), episodename VARCHAR(255), episodenumber INTEGER , seasonnumber INTEGER NULL ,firstaired TIMESTAMP, firstaired_iso varchar(25), IMDB_ID VARCHAR(20), language VARCHAR(3), overview TEXT default NULL, rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), filename VARCHAR(255), images TEXT, watched INTEGER DEFAULT 0, watchedAt TIMESTAMP NULL, downloaded INTEGER DEFAULT 0, magnetHash VARCHAR(40) NULL, TRAKT_ID INTEGER NULL, leaked INTEGER DEFAULT 0, absolute INTEGER NULL, TMDB_ID INTEGER NULL )',
  adapter: 'dbAdapter',
  indexes: [
    'watched',
    'TVDB_ID',
    'TRAKT_ID',
    'ID_Serie, firstaired',
    'ID_Season'
  ],
  fixtures: [

  ],
  migrations: {
    8: [
      'ALTER TABLE Episodes RENAME TO Episodes_bak',
      'CREATE TABLE Episodes ( ID_Episode INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, ID_Season INTEGER NULL, TVDB_ID INTEGER UNIQUE, episodename VARCHAR(255), episodenumber INTEGER , firstaired TIMESTAMP , imdb_id VARCHAR(20), language VARCHAR(3), overview TEXT default NULL, rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL) , seasonnumber INTEGER NULL , filename VARCHAR(255) , lastupdated TIMESTAMP , seasonid INTEGER NULL , seriesid INTEGER NULL , lastchecked TIMESTAMP NULL, watched VARCHAR(1), watchedAt TIMESTAMP NULL, magnetHash VARCHAR(40) NULL )',
      'INSERT OR IGNORE INTO Episodes (ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, firstaired, imdb_id, language, overview, rating, ratingcount, seasonnumber, filename, lastupdated, seasonid, seriesid, lastchecked, watched, watchedAt, magnetHash) select ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, firstaired, imdb_id, language, overview, rating, ratingcount, seasonnumber, filename, lastupdated, seasonid, seriesid, lastchecked, watched, watchedAt, magnetHash from Episodes_bak',
      'DROP TABLE Episodes_bak'
    ],
    9: [
      'UPDATE Episodes set watched = "1" where watched = 1.0'
    ],
    10: [
      'ALTER TABLE Episodes RENAME TO Episodes_bak',
      'CREATE TABLE Episodes ( ID_Episode INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, ID_Season INTEGER NULL, TVDB_ID INTEGER UNIQUE, episodename VARCHAR(255), episodenumber INTEGER , seasonnumber INTEGER NULL , firstaired TIMESTAMP, firstaired_iso varchar(25), IMDB_ID VARCHAR(20), language VARCHAR(3), overview TEXT default NULL, rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), filename VARCHAR(255) , images TEXT, watched INTEGER DEFAULT 0, watchedAt TIMESTAMP NULL, downloaded INTEGER DEFAULT 0, magnetHash VARCHAR(40) NULL )',
      'INSERT OR IGNORE INTO Episodes (ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, IMDB_ID, language, overview, rating, ratingcount, filename, watched, watchedAt, magnetHash) select ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, imdb_id, language, overview, rating, ratingcount, filename, coalesce(watched,0), watchedAt, magnetHash from Episodes_bak;',
      'DROP TABLE Episodes_bak'
    ],
    11: [
      'ALTER TABLE Episodes RENAME TO Episodes_bak',
      'CREATE TABLE Episodes ( ID_Episode INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, ID_Season INTEGER NULL, TVDB_ID INTEGER UNIQUE, episodename VARCHAR(255), episodenumber INTEGER , seasonnumber INTEGER NULL ,firstaired TIMESTAMP, firstaired_iso varchar(25), IMDB_ID VARCHAR(20), language VARCHAR(3), overview TEXT default NULL, rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), filename VARCHAR(255) , images TEXT, watched INTEGER DEFAULT 0, watchedAt TIMESTAMP NULL, downloaded INTEGER DEFAULT 0, magnetHash VARCHAR(40) NULL, TRAKT_ID INTEGER NULL )',
      'INSERT OR IGNORE INTO Episodes (ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, IMDB_ID, language, overview, rating, ratingcount, filename, images, watched, watchedAt, downloaded, magnetHash) select ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, imdb_id, language, overview, rating, ratingcount, filename, images, coalesce(watched,0), watchedAt, downloaded, magnetHash from Episodes_bak;',
      'DROP TABLE Episodes_bak'
    ],
    12: [
      'ALTER TABLE Episodes RENAME TO Episodes_bak',
      'CREATE TABLE Episodes ( ID_Episode INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, ID_Season INTEGER NULL, TVDB_ID INTEGER UNIQUE, episodename VARCHAR(255), episodenumber INTEGER , seasonnumber INTEGER NULL ,firstaired TIMESTAMP, firstaired_iso varchar(25), IMDB_ID VARCHAR(20), language VARCHAR(3), overview TEXT default NULL, rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), filename VARCHAR(255) , images TEXT, watched INTEGER DEFAULT 0, watchedAt TIMESTAMP NULL, downloaded INTEGER DEFAULT 0, magnetHash VARCHAR(40) NULL, TRAKT_ID INTEGER NULL, leaked INTEGER DEFAULT 0 )',
      'INSERT OR IGNORE INTO Episodes (ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, IMDB_ID, language, overview, rating, ratingcount, filename, images, watched, watchedAt, downloaded, magnetHash, TRAKT_ID) select ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, imdb_id, language, overview, rating, ratingcount, filename, images, watched, watchedAt, downloaded, magnetHash, TRAKT_ID from Episodes_bak;',
      'DROP TABLE Episodes_bak'
    ],
    13: [
      'ALTER TABLE Episodes RENAME TO Episodes_bak',
      'CREATE TABLE Episodes ( ID_Episode INTEGER PRIMARY KEY NOT NULL,ID_Serie INTEGER NOT NULL, ID_Season INTEGER NULL, TVDB_ID INTEGER DEFAULT(NULL), episodename VARCHAR(255), episodenumber INTEGER , seasonnumber INTEGER NULL ,firstaired TIMESTAMP, firstaired_iso varchar(25), IMDB_ID VARCHAR(20), language VARCHAR(3), overview TEXT default NULL, rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), filename VARCHAR(255) , images TEXT, watched INTEGER DEFAULT 0, watchedAt TIMESTAMP NULL, downloaded INTEGER DEFAULT 0, magnetHash VARCHAR(40) NULL, TRAKT_ID INTEGER NULL, leaked INTEGER DEFAULT 0 )',
      'INSERT OR IGNORE INTO Episodes (ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, IMDB_ID, language, overview, rating, ratingcount, filename, images, watched, watchedAt, downloaded, magnetHash, TRAKT_ID, leaked) select ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, imdb_id, language, overview, rating, ratingcount, filename, images, watched, watchedAt, downloaded, magnetHash, TRAKT_ID, leaked from Episodes_bak;',
      'DROP TABLE Episodes_bak'
    ],
    14: [
      'ALTER TABLE Episodes RENAME TO Episodes_bak',
      'CREATE TABLE Episodes ( ID_Episode INTEGER PRIMARY KEY NOT NULL, ID_Serie INTEGER NOT NULL, ID_Season INTEGER NULL, TVDB_ID INTEGER DEFAULT(NULL), episodename VARCHAR(255), episodenumber INTEGER , seasonnumber INTEGER NULL ,firstaired TIMESTAMP, firstaired_iso varchar(25), IMDB_ID VARCHAR(20), language VARCHAR(3), overview TEXT default NULL, rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), filename VARCHAR(255), images TEXT, watched INTEGER DEFAULT 0, watchedAt TIMESTAMP NULL, downloaded INTEGER DEFAULT 0, magnetHash VARCHAR(40) NULL, TRAKT_ID INTEGER NULL, leaked INTEGER DEFAULT 0, absolute INTEGER NULL )',
      'INSERT OR IGNORE INTO Episodes (ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, firstaired_iso, IMDB_ID, language, overview, rating, ratingcount, filename, images, watched, watchedAt, downloaded, magnetHash, TRAKT_ID, leaked) select ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, firstaired_iso, IMDB_ID, language, overview, rating, ratingcount, filename, images, watched, watchedAt, downloaded, magnetHash, TRAKT_ID, leaked from Episodes_bak;',
      'DROP TABLE Episodes_bak'
    ],
    15: [
      'ALTER TABLE Episodes RENAME TO Episodes_bak',
      'CREATE TABLE Episodes ( ID_Episode INTEGER PRIMARY KEY NOT NULL, ID_Serie INTEGER NOT NULL, ID_Season INTEGER NULL, TVDB_ID INTEGER DEFAULT(NULL), episodename VARCHAR(255), episodenumber INTEGER , seasonnumber INTEGER NULL ,firstaired TIMESTAMP, firstaired_iso varchar(25), IMDB_ID VARCHAR(20), language VARCHAR(3), overview TEXT default NULL, rating INTEGER DEFAULT(NULL), ratingcount INTEGER DEFAULT(NULL), filename VARCHAR(255), images TEXT, watched INTEGER DEFAULT 0, watchedAt TIMESTAMP NULL, downloaded INTEGER DEFAULT 0, magnetHash VARCHAR(40) NULL, TRAKT_ID INTEGER NULL, leaked INTEGER DEFAULT 0, absolute INTEGER NULL, TMDB_ID INTEGER NULL )',
      'INSERT OR IGNORE INTO Episodes (ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, firstaired_iso, IMDB_ID, language, overview, rating, ratingcount, filename, images, watched, watchedAt, downloaded, magnetHash, TRAKT_ID, leaked, absolute) select ID_Episode, ID_Serie, ID_Season, TVDB_ID, episodename, episodenumber, seasonnumber, firstaired, firstaired_iso, IMDB_ID, language, overview, rating, ratingcount, filename, images, watched, watchedAt, downloaded, magnetHash, TRAKT_ID, leaked, absolute from Episodes_bak;',
      'DROP TABLE Episodes_bak'
    ]
  }
}, {
  watched: {
    get: function() {
      // console.log("accessor override");
      return parseInt(this.get('watched'))
    }
  },
  getSeason: function() {
    return this.FindOne('Season')
  },
  getFormattedEpisode: function() {
    return this.formatEpisode(this.seasonnumber, this.episodenumber, this.absolute)
  },

  formatEpisode: function(season, episode, absolute) {
    absolute = absolute || ''
    var sn = season.toString()

    var en = episode.toString()

    var abs = absolute.toString()

    var out = ['s', sn.length == 1 ? '0' + sn : sn, 'e', en.length == 1 ? '0' + en : en, abs != '' ? abs.length == 1 ? '(0' + abs + ')' : '(' + abs + ')' : ''].join('')
    return out
  },

  getAirDate: function() {
    return this.firstaired === 0 ? '?' : new Date(this.firstaired)
  },
  getAirTime: function() {
    if (!this.cachedAirTime) {
      this.cachedAirTime = new Date(this.firstaired).toTimeString().substring(0, 5)
    }
    return this.cachedAirTime
  },
  hasAired: function() {
    return this.firstaired && this.firstaired !== 0 && this.firstaired <= new Date().getTime()
  },
  isWatched: function() {
    return this.watched && parseInt(this.watched) == 1
  },
  isLeaked: function() {
    return this.leaked && parseInt(this.leaked) == 1
  },

  markWatched: function(watchedDownloadedPaired, $rootScope) {
    if (typeof watchedDownloadedPaired === 'undefined') {
      watchedDownloadedPaired = true
    }
    this.watched = 1
    this.watchedAt = new Date().getTime()
    if (watchedDownloadedPaired) {
      // if you are marking this as watched you must have also downloaded it!
      this.downloaded = 1
    }
    return this.Persist().then(function() {
      if ($rootScope) {
        $rootScope.$broadcast('episode:marked:watched', this)
        if (watchedDownloadedPaired) {
          $rootScope.$broadcast('episode:marked:downloaded', this)
        }
      }
      return this
    }.bind(this))
  },

  markNotWatched: function($rootScope) {
    this.watched = 0
    this.watchedAt = null
    return this.Persist().then(function() {
      if ($rootScope) {
        $rootScope.$broadcast('episode:marked:notwatched', this)
      }
      return this
    }.bind(this))
  },

  isDownloaded: function() {
    return this.downloaded && parseInt(this.downloaded) == 1
  },

  markDownloaded: function($rootScope) {
    this.downloaded = 1
    return this.Persist().then(function() {
      if ($rootScope) {
        $rootScope.$broadcast('episode:marked:downloaded', this)
      }
      return this
    }.bind(this))
  },

  markNotDownloaded: function(watchedDownloadedPaired, $rootScope) {
    if (typeof watchedDownloadedPaired === 'undefined') {
      watchedDownloadedPaired = true
    }
    this.downloaded = 0
    if (watchedDownloadedPaired) {
      // if you are marking this as NOT downloaded, you can not have watched it either!
      this.watched = 0
      this.watchedAt = null
      this.magnetHash = null
    }
    return this.Persist().then(function() {
      if ($rootScope) {
        $rootScope.$broadcast('episode:marked:notdownloaded', this)
        if (watchedDownloadedPaired) {
          $rootScope.$broadcast('episode:marked:notwatched', this)
        }
      }
      return this
    }.bind(this))
  }
})

CRUD.define(Fanart, {
  className: 'Fanart',
  table: 'Fanart',
  primary: 'ID_Fanart',
  fields: ['ID_Fanart', 'TVDB_ID', 'poster', 'json'],
  autoSerialize: ['json'],
  relations: {},
  createStatement: 'CREATE TABLE Fanart ( ID_Fanart INTEGER PRIMARY KEY NOT NULL, TVDB_ID INTEGER NOT NULL, poster VARCHAR(255) NULL, json TEXT )',
  adapter: 'dbAdapter',
  indexes: ['TVDB_ID']
}, {

})

CRUD.define(TMDBFanart, {
  className: 'TMDBFanart',
  table: 'TMDBFanart',
  primary: 'id',
  fields: ['id', 'entity_type', 'TMDB_ID', 'poster', 'fanart', 'screenshot', 'added'],
  relations: {},
  createStatement: 'CREATE TABLE TMDBFanart (id INTEGER PRIMARY KEY NOT NULL, entity_type INTEGER NOT NULL, tmdb_id INTEGER NOT NULL, poster TEXT DEFAULT(NULL), fanart TEXT DEFAULT(NULL), screenshot TEXT DEFAULT(NULL), added DATE DEFAULT(NULL))',
  adapter: 'dbAdapter',
  indexes: ['entity_type', 'TMDB_ID']
}, {
})

CRUD.define(Jackett, {
  className: 'Jackett',
  table: 'Jackett',
  primary: 'ID_Jackett',
  fields: ['ID_Jackett', 'name', 'enabled', 'torznab', 'torznabEnabled', 'apiKey', 'json'],
  relations: {},
  createStatement: 'CREATE TABLE Jackett ( ID_Jackett INTEGER PRIMARY KEY NOT NULL, name VARCHAR(40) DEFAULT(NULL), torznab VARCHAR(200) DEFAULT(NULL), enabled INTEGER DEFAULT(0), torznabEnabled INTEGER DEFAULT(0), apiKey VARCHAR(40) DEFAULT(NULL), json TEXT )',
  adapter: 'dbAdapter',
  migrations: {
    2: [
      'ALTER TABLE Jackett RENAME TO Jackett_bak',
      'CREATE TABLE Jackett ( ID_Jackett INTEGER PRIMARY KEY NOT NULL, name VARCHAR(40) DEFAULT(NULL), torznab VARCHAR(200) DEFAULT(NULL), enabled INTEGER DEFAULT(0), torznabEnabled INTEGER DEFAULT(0), apiKey VARCHAR(40) DEFAULT(NULL), json TEXT )',
      'INSERT OR IGNORE INTO Jackett (ID_Jackett, name, torznab, enabled, torznabEnabled ) select ID_Jackett, name, torznab, enabled, torznabEnabled  from Jackett_bak',
      'DROP TABLE Jackett_bak'
    ]
  }
}, {
  isEnabled: function() {
    return this.enabled && parseInt(this.enabled) == 1
  },
  setEnabled: function() {
    this.enabled = 1
    return this.Persist().then(function() {
      return this
    }.bind(this))
  },
  setDisabled: function() {
    this.enabled = 0
    return this.Persist().then(function() {
      return this
    }.bind(this))
  }
})
;
/**
 * Loaded after defining the CRUD.entities.
 * Boots up CRUD.js database init procedure to the SQLiteAdapter
 */

CRUD.DEBUG = false
if (localStorage.getItem('CRUD.DEBUG')) {
  CRUD.DEBUG = (localStorage.getItem('CRUD.DEBUG') === 'true')
}

CRUD.setAdapter(new CRUD.SQLiteAdapter('seriesguide_chrome', {
  estimatedSize: 25 * 1024 * 1024
}))
;
/**
 * The background.js service gets launched by chrome's background process when a timer is about to fire
 * It's basically a minimalist implementation of DuckieTV's favorites update mechanism.
 *
 * The way this works is simple:
 * A timer launches an event channel at a given time
 * It broadcasts a message on a channel something is listening for (for instance favorites:update, which triggers the FavoritesService)
 * After that the page gets torn down again to reduce memory footprint.
 *
 */

/**
 * Make sure migrations don't run on the latest versions.
 */
chrome.runtime.onInstalled.addListener(function(details) {
  localStorage.setItem('runtime.event', JSON.stringify(details))
  if (details.reason == 'install') {
    console.info('This is a first install!')
    localStorage.setItem('install.notify', chrome.runtime.getManifest().version)
    /*
         * example: localStorage.setItem('0.54.createtimers', 'done');
         */
  } else if (details.reason == 'update') {
    var thisVersion = chrome.runtime.getManifest().version
    console.info('Updated from ' + details.previousVersion + ' to ' + thisVersion + '!')
    if (details.previousVersion != thisVersion) {
      localStorage.setItem('install.notify', thisVersion)
    }
  }
})

/**
 * Listen for incoming CRUD.js queries coming from the BackgroundPageAdapter
 * This adapter opens a channel to the background page and forwards all queries here to be executed.
 *
 *
 */
chrome.runtime.onConnect.addListener(function(port) {
  CRUD.log('New incoming connection from foreground page')
  if (port.name != 'CRUD') return

  port.onMessage.addListener(function(msg) {
    CRUD.log(msg.command + ' Message received from foreground page ', msg)
    switch (msg.command) {
      case 'Find':
        CRUD.Find(msg.what, msg.filters, msg.options).then(function(result) {
          port.postMessage({
            guid: msg.guid,
            result: result,
            Action: 'find'
          })
        }, function(err) {
          console.error('Error: ', err, msg)
          port.postMessage({
            guid: msg.guid,
            error: err
          })
        })
        break
      case 'Persist':
        var tmp = CRUD.fromCache(msg.type, msg.values)
        var isNew = msg.ID === false
        if (!isNew) {
          tmp.__values__[CRUD.EntityManager.getPrimary(msg.type)] = msg.ID
        }
        tmp.Persist().then(function(result) {
          port.postMessage({
            guid: msg.guid,
            result: {
              ID: tmp.getID(),
              Action: isNew ? 'inserted' : 'updated'
            }
          })
        }, function(err) {
          console.error('Error: ', err, msg)
          port.postMessage({
            guid: msg.guid,
            error: err
          })
        })
        break
      case 'Delete':
        var tmp = CRUD.fromCache(msg.type, msg.values)
        tmp.Delete().then(function(result) {
          port.postMessage({
            guid: msg.guid,
            result: result,
            Action: 'deleted'
          })
        }, function(err) {
          console.error('Error: ', err, msg)
          port.postMessage({
            guid: msg.guid,
            error: err
          })
        })
        break
      case 'query':
        CRUD.executeQuery(msg.sql, msg.params).then(function(result) {
          port.postMessage({
            guid: msg.guid,
            result: result,
            action: 'query'
          })
        }, function(err) {
          console.error('Error: ', err, msg)
          port.postMessage({
            guid: msg.guid,
            error: err
          })
        })
        break
    }
  })

  port.onDisconnect.addListener(function() {
    CRUD.log('Port disconnected')
    port.disconnected = true
    port.postMessage = function() {
      console.log('Dropping message on closed port: ', arguments)
    }
  })
})
