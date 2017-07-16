.PHONY: all build reload-and-build reload clean clobber distribute js

include build/vars.mk

all: reload-and-build

build: js

reload-and-build: reload
	$(MAKE) build

reload:
	$(MAKE) -B build/vars.mk

clean:
	-rm -rf build/

clobber: clean
	-rm -rf dist/

distribute: reload-and-build
	-rm -rf dist
	cp -pr build dist
	-rm -f dist/vars.mk

js: $(DST_JS)

build/vars.mk: tools/vars.js
	@mkdir -p $(dir $@)
	node $< > $@

BIN := $(shell npm bin)

$(DST_JS): $(SRC_TS) $(SRC_JS) $(CONFIG_JS)
	@mkdir -p $(dir $@)
	$(BIN)/tsc
